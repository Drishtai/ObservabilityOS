import { scrubText, scrubObject } from "./scrubber";
import {
  MetricsCollector,
  MetricOptions,
  MetricsCollectorConfig,
  QueuedMetric,
} from "./metrics";
import {
  Tracer,
  Span,
  SpanOptions,
  SpanEvent,
  QueuedSpan,
  TracerConfig,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
} from "./tracer";

export {
  scrubText,
  scrubObject,
  MetricsCollector,
  Tracer,
  Span,
  generateTraceId,
  generateSpanId,
  parseTraceparent,
  createTraceparent,
  type MetricOptions,
  type MetricsCollectorConfig,
  type QueuedMetric,
  type SpanOptions,
  type SpanEvent,
  type QueuedSpan,
  type TracerConfig,
};

function resolveSubEndpoint(base: string, path: string): string {
  if (base.includes("/api/ingest")) {
    return base.replace(/\/api\/ingest\/?$/, path);
  }
  return `${base.replace(/\/+$/, "")}${path}`;
}

export interface LogOptions {
  service?: string;
  environment?: "prod" | "staging" | "dev";
  timestamp?: Date | string;
  traceId?: string;
  metadata?: Record<string, unknown>;
}

export interface LoggerConfig {
  apiKey: string;
  endpoint?: string;
  metricsEndpoint?: string;
  tracesEndpoint?: string;
  defaultService: string;
  defaultEnvironment?: "prod" | "staging" | "dev";
  batchSize?: number;
  flushIntervalMs?: number;
  enableMetrics?: boolean;
  metricsAutoSampleIntervalMs?: number;
  enableTracing?: boolean;
}

interface QueuedLog {
  service: string;
  environment: "prod" | "staging" | "dev";
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

export class Logger {
  private apiKey: string;
  private endpoint: string;
  private defaultService: string;
  private defaultEnvironment: "prod" | "staging" | "dev";
  private batchSize: number;
  private queue: QueuedLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private metricsCollector: MetricsCollector | null = null;
  private tracer: Tracer | null = null;

  private activeFlushPromise: Promise<void> | null = null;

  constructor(config: LoggerConfig) {
    this.apiKey = config.apiKey;
    this.endpoint = config.endpoint || "http://localhost:3000/api/ingest";
    this.defaultService = config.defaultService;
    this.defaultEnvironment = config.defaultEnvironment || "dev";
    this.batchSize = config.batchSize ?? 20;

    const shouldEnableTracing = config.enableTracing !== false;
    if (shouldEnableTracing) {
      this.tracer = new Tracer({
        apiKey: this.apiKey,
        endpoint:
          config.tracesEndpoint ||
          resolveSubEndpoint(this.endpoint, "/api/traces/ingest"),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
      });
    }

    if (config.enableMetrics) {
      this.metricsCollector = new MetricsCollector({
        apiKey: this.apiKey,
        endpoint:
          config.metricsEndpoint ||
          resolveSubEndpoint(this.endpoint, "/api/metrics/ingest"),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
        autoSampleIntervalMs: config.metricsAutoSampleIntervalMs ?? 10000,
      });
    }

    const flushIntervalMs = config.flushIntervalMs ?? 1000;
    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error("[ObservabilityOS SDK] Background flush failed:", err);
        });
      }, flushIntervalMs);
      // Prevent keeping the node process alive just for the timer
      if (
        this.flushTimer &&
        typeof this.flushTimer === "object" &&
        "unref" in this.flushTimer &&
        typeof (this.flushTimer as { unref?: () => void }).unref === "function"
      ) {
        (this.flushTimer as { unref: () => void }).unref();
      }
    }
  }

  /**
   * Send a log message with specific severity level and options.
   */
  public log(
    level: "error" | "warn" | "info" | "debug",
    message: string,
    options?: LogOptions,
  ): void {
    const formattedTimestamp = options?.timestamp
      ? options.timestamp instanceof Date
        ? options.timestamp.toISOString()
        : String(options.timestamp)
      : new Date().toISOString();

    const logEntry: QueuedLog = {
      service: options?.service || this.defaultService,
      environment: options?.environment || this.defaultEnvironment,
      timestamp: formattedTimestamp,
      level,
      message: scrubText(message),
      metadata: options?.metadata
        ? (scrubObject(options.metadata) as Record<string, unknown>)
        : undefined,
      traceId: options?.traceId,
    };

    this.queue.push(logEntry);

    if (this.queue.length >= this.batchSize) {
      this.flush().catch((err) => {
        console.error("[ObservabilityOS SDK] Buffer batch flush failed:", err);
      });
    }
  }

  public info(message: string, options?: LogOptions): void {
    this.log("info", message, options);
  }

  public warn(message: string, options?: LogOptions): void {
    this.log("warn", message, options);
  }

  public error(message: string, options?: LogOptions): void {
    this.log("error", message, options);
  }

  public debug(message: string, options?: LogOptions): void {
    this.log("debug", message, options);
  }

  /**
   * Get the underlying MetricsCollector instance (if initialized).
   */
  public getMetricsCollector(): MetricsCollector | null {
    return this.metricsCollector;
  }

  /**
   * Record a system/application metric (CPU, memory, latency).
   */
  public recordMetric(metric: MetricOptions): void {
    if (!this.metricsCollector) {
      this.metricsCollector = new MetricsCollector({
        apiKey: this.apiKey,
        endpoint: this.endpoint.replace(
          /\/api\/ingest\/?$/,
          "/api/metrics/ingest",
        ),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
      });
    }
    this.metricsCollector.recordMetric(metric);
  }

  /**
   * Record a latency timing in milliseconds.
   */
  public recordLatency(durationMs: number): void {
    if (!this.metricsCollector) {
      this.metricsCollector = new MetricsCollector({
        apiKey: this.apiKey,
        endpoint: this.endpoint.replace(
          /\/api\/ingest\/?$/,
          "/api/metrics/ingest",
        ),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
      });
    }
    this.metricsCollector.recordLatency(durationMs);
  }

  /**
   * Helper to execute a function and measure its latency automatically.
   */
  public async trackLatency<T>(fn: () => Promise<T> | T): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.recordLatency(Date.now() - start);
    }
  }

  /**
   * Get the underlying Tracer instance (if initialized).
   */
  public getTracer(): Tracer | null {
    return this.tracer;
  }

  /**
   * Start a new distributed trace span.
   */
  public startSpan(name: string, options?: SpanOptions): Span {
    if (!this.tracer) {
      this.tracer = new Tracer({
        apiKey: this.apiKey,
        endpoint: this.endpoint.replace(
          /\/api\/ingest\/?$/,
          "/api/traces/ingest",
        ),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
      });
    }
    return this.tracer.startSpan(name, options);
  }

  /**
   * Execute an operation wrapped inside a distributed trace span automatically.
   */
  public async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    options?: SpanOptions,
  ): Promise<T> {
    if (!this.tracer) {
      this.tracer = new Tracer({
        apiKey: this.apiKey,
        endpoint: this.endpoint.replace(
          /\/api\/ingest\/?$/,
          "/api/traces/ingest",
        ),
        defaultService: this.defaultService,
        defaultEnvironment: this.defaultEnvironment,
      });
    }
    return this.tracer.withSpan(name, fn, options);
  }

  /**
   * Flush all currently queued logs, metrics, and trace spans to the Ingestion APIs.
   */
  public async flush(): Promise<void> {
    if (this.metricsCollector) {
      await this.metricsCollector.flush().catch((err) => {
        console.error(
          "[ObservabilityOS SDK] Failed to flush metrics collector:",
          err,
        );
      });
    }

    if (this.tracer) {
      await this.tracer.flush().catch((err) => {
        console.error("[ObservabilityOS SDK] Failed to flush tracer:", err);
      });
    }

    if (this.activeFlushPromise) {
      await this.activeFlushPromise;
      if (this.queue.length > 0) {
        return this.flush();
      }
      return;
    }

    if (this.queue.length === 0) {
      return;
    }

    const itemsToSend = [...this.queue];
    this.queue = [];
    let flushSuccessful = false;

    this.activeFlushPromise = (async () => {
      try {
        const response = await fetch(this.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
          },
          body: JSON.stringify(itemsToSend),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(
            `[ObservabilityOS SDK] Ingestion API returned ${response.status}:`,
            errorText,
          );
          // Put logs back in the queue to try again
          this.queue.unshift(...itemsToSend);
        } else {
          flushSuccessful = true;
        }
      } catch (err) {
        console.error(
          "[ObservabilityOS SDK] Connection error during flush:",
          err,
        );
        // Put logs back in the queue to try again
        this.queue.unshift(...itemsToSend);
      }
    })();

    try {
      await this.activeFlushPromise;
    } finally {
      this.activeFlushPromise = null;
    }

    if (flushSuccessful && this.queue.length > 0) {
      return this.flush();
    }
  }

  /**
   * Cleanup timer resources when the logger is no longer needed.
   */
  public destroy(): void {
    if (this.metricsCollector) {
      this.metricsCollector.destroy();
      this.metricsCollector = null;
    }
    if (this.tracer) {
      this.tracer.destroy();
      this.tracer = null;
    }
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
