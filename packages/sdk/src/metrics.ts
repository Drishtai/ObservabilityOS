// Ambient declaration for universal compatibility (Browser / Node / Edge)
declare const process:
  | {
      cpuUsage?: (prev?: { user: number; system: number }) => {
        user: number;
        system: number;
      };
      memoryUsage?: () => {
        heapUsed: number;
        heapTotal: number;
        external?: number;
        rss?: number;
      };
    }
  | undefined;

export interface MetricOptions {
  service?: string;
  environment?: "prod" | "staging" | "dev";
  timestamp?: Date | string;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  latencyMs: number;
}

export interface MetricsCollectorConfig {
  apiKey: string;
  endpoint?: string;
  defaultService: string;
  defaultEnvironment?: "prod" | "staging" | "dev";
  batchSize?: number;
  flushIntervalMs?: number;
  autoSampleIntervalMs?: number;
}

export interface QueuedMetric {
  service: string;
  environment: "prod" | "staging" | "dev";
  timestamp: string;
  cpuUsage: number;
  memoryUsage: number;
  memoryLimit: number;
  latencyMs: number;
}

export class MetricsCollector {
  private apiKey: string;
  private endpoint: string;
  private defaultService: string;
  private defaultEnvironment: "prod" | "staging" | "dev";
  private batchSize: number;
  private queue: QueuedMetric[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sampleTimer: ReturnType<typeof setInterval> | null = null;
  private activeFlushPromise: Promise<void> | null = null;

  // CPU usage tracking state
  private lastCpuUsage: { user: number; system: number } | null = null;
  private lastCpuTimestamp = 0;
  private recordedLatencies: number[] = [];

  constructor(config: MetricsCollectorConfig) {
    this.apiKey = config.apiKey;
    this.endpoint =
      config.endpoint || "http://localhost:3000/api/metrics/ingest";
    this.defaultService = config.defaultService;
    this.defaultEnvironment = config.defaultEnvironment || "dev";
    this.batchSize = config.batchSize ?? 10;

    const flushIntervalMs = config.flushIntervalMs ?? 5000;
    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error(
            "[ObservabilityOS Metrics] Background flush failed:",
            err,
          );
        });
      }, flushIntervalMs);

      if (
        this.flushTimer &&
        typeof this.flushTimer === "object" &&
        "unref" in this.flushTimer &&
        typeof (this.flushTimer as { unref?: () => void }).unref === "function"
      ) {
        (this.flushTimer as { unref: () => void }).unref();
      }
    }

    if (config.autoSampleIntervalMs && config.autoSampleIntervalMs > 0) {
      this.startAutoSampling(config.autoSampleIntervalMs);
    }
  }

  public recordMetric(options: MetricOptions): void {
    const formattedTimestamp = options.timestamp
      ? options.timestamp instanceof Date
        ? options.timestamp.toISOString()
        : String(options.timestamp)
      : new Date().toISOString();

    const item: QueuedMetric = {
      service: options.service || this.defaultService,
      environment: options.environment || this.defaultEnvironment,
      timestamp: formattedTimestamp,
      cpuUsage: Math.max(0, Math.min(100, options.cpuUsage)),
      memoryUsage: Math.max(0, options.memoryUsage),
      memoryLimit: Math.max(0, options.memoryLimit),
      latencyMs: Math.max(0, options.latencyMs),
    };

    this.queue.push(item);

    if (this.queue.length >= this.batchSize) {
      this.flush().catch((err) => {
        console.error(
          "[ObservabilityOS Metrics] Batch buffer flush failed:",
          err,
        );
      });
    }
  }

  public recordLatency(durationMs: number): void {
    if (durationMs >= 0) {
      this.recordedLatencies.push(durationMs);
    }
  }

  public async trackLatency<T>(fn: () => Promise<T> | T): Promise<T> {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      this.recordLatency(Date.now() - start);
    }
  }

  public sampleSystemMetrics(): QueuedMetric | null {
    if (
      typeof process === "undefined" ||
      typeof process.cpuUsage !== "function" ||
      typeof process.memoryUsage !== "function"
    ) {
      return null;
    }

    const now = Date.now();
    const currentCpu = process.cpuUsage();
    let cpuPercent = 0;

    if (this.lastCpuUsage && this.lastCpuTimestamp > 0) {
      const elapsedMs = now - this.lastCpuTimestamp;
      if (elapsedMs > 0) {
        const userDiff = currentCpu.user - this.lastCpuUsage.user;
        const sysDiff = currentCpu.system - this.lastCpuUsage.system;
        const totalMicro = userDiff + sysDiff;
        cpuPercent = Math.min(
          100,
          Math.max(0, (totalMicro / (elapsedMs * 1000)) * 100),
        );
      }
    }

    this.lastCpuUsage = currentCpu;
    this.lastCpuTimestamp = now;

    const mem = process.memoryUsage();
    const memoryUsageMb =
      Math.round((mem.heapUsed / (1024 * 1024)) * 100) / 100;
    const memoryLimitMb =
      Math.round((mem.heapTotal / (1024 * 1024)) * 100) / 100;

    let avgLatency = 0;
    if (this.recordedLatencies.length > 0) {
      const sum = this.recordedLatencies.reduce((a, b) => a + b, 0);
      avgLatency =
        Math.round((sum / this.recordedLatencies.length) * 100) / 100;
      this.recordedLatencies = [];
    }

    const metric: QueuedMetric = {
      service: this.defaultService,
      environment: this.defaultEnvironment,
      timestamp: new Date(now).toISOString(),
      cpuUsage: Math.round(cpuPercent * 100) / 100,
      memoryUsage: memoryUsageMb,
      memoryLimit: memoryLimitMb,
      latencyMs: avgLatency,
    };

    return metric;
  }

  public startAutoSampling(intervalMs = 10000): void {
    this.stopAutoSampling();

    if (
      typeof process !== "undefined" &&
      typeof process.cpuUsage === "function"
    ) {
      this.lastCpuUsage = process.cpuUsage();
      this.lastCpuTimestamp = Date.now();
    }

    this.sampleTimer = setInterval(() => {
      const sample = this.sampleSystemMetrics();
      if (sample) {
        this.recordMetric(sample);
      }
    }, intervalMs);

    if (
      this.sampleTimer &&
      typeof this.sampleTimer === "object" &&
      "unref" in this.sampleTimer &&
      typeof (this.sampleTimer as { unref?: () => void }).unref === "function"
    ) {
      (this.sampleTimer as { unref: () => void }).unref();
    }
  }

  public stopAutoSampling(): void {
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
  }

  public async flush(): Promise<void> {
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
            `[ObservabilityOS Metrics] Ingest returned ${response.status}:`,
            errorText,
          );
          this.queue.unshift(...itemsToSend);
        } else {
          flushSuccessful = true;
        }
      } catch (err) {
        console.error(
          "[ObservabilityOS Metrics] Connection error during flush:",
          err,
        );
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

  public destroy(): void {
    this.stopAutoSampling();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
