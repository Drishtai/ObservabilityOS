export interface SpanOptions {
  service?: string;
  environment?: "prod" | "staging" | "dev";
  traceId?: string;
  parentSpanId?: string;
  kind?: "server" | "client" | "internal" | "producer" | "consumer";
  attributes?: Record<string, unknown>;
}

export interface SpanEvent {
  name: string;
  timestamp: string;
  attributes?: Record<string, unknown>;
}

export interface QueuedSpan {
  service: string;
  environment: "prod" | "staging" | "dev";
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: "server" | "client" | "internal" | "producer" | "consumer";
  startTime: string;
  endTime: string;
  durationMs: number;
  status: "ok" | "error" | "unset";
  statusCode?: number;
  errorMessage?: string;
  attributes?: Record<string, unknown>;
  events?: SpanEvent[];
}

export interface TracerConfig {
  apiKey: string;
  endpoint?: string;
  defaultService: string;
  defaultEnvironment?: "prod" | "staging" | "dev";
  batchSize?: number;
  flushIntervalMs?: number;
}

function generateId(bytes = 8): string {
  let result = "";
  const hexChars = "0123456789abcdef";
  for (let i = 0; i < bytes * 2; i++) {
    result += hexChars[Math.floor(Math.random() * 16)];
  }
  return result;
}

export class Span {
  public readonly traceId: string;
  public readonly spanId: string;
  public readonly parentSpanId?: string;
  public readonly name: string;
  public readonly kind:
    | "server"
    | "client"
    | "internal"
    | "producer"
    | "consumer";
  public readonly service: string;
  public readonly environment: "prod" | "staging" | "dev";

  private startTime: number;
  private endTime: number | null = null;
  private status: "ok" | "error" | "unset" = "ok";
  private statusCode?: number;
  private errorMessage?: string;
  private attributes: Record<string, unknown> = {};
  private events: SpanEvent[] = [];
  private onEnd: (span: Span) => void;

  constructor(
    name: string,
    options: SpanOptions | undefined,
    defaultService: string,
    defaultEnvironment: "prod" | "staging" | "dev",
    onEnd: (span: Span) => void,
  ) {
    this.name = name;
    this.service = options?.service || defaultService;
    this.environment = options?.environment || defaultEnvironment;
    this.traceId = options?.traceId || generateId(16);
    this.spanId = generateId(8);
    this.parentSpanId = options?.parentSpanId;
    this.kind = options?.kind || "internal";
    this.attributes = { ...(options?.attributes || {}) };
    this.startTime = Date.now();
    this.onEnd = onEnd;
  }

  public setAttribute(key: string, value: unknown): this {
    this.attributes[key] = value;
    return this;
  }

  public setAttributes(attributes: Record<string, unknown>): this {
    Object.assign(this.attributes, attributes);
    return this;
  }

  public addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes,
    });
    return this;
  }

  public setStatus(
    status: "ok" | "error" | "unset",
    errorMessage?: string,
    statusCode?: number,
  ): this {
    this.status = status;
    if (errorMessage) this.errorMessage = errorMessage;
    if (statusCode !== undefined) this.statusCode = statusCode;
    return this;
  }

  public end(): void {
    if (this.endTime !== null) return;
    this.endTime = Date.now();
    this.onEnd(this);
  }

  public toQueuedSpan(): QueuedSpan {
    const end = this.endTime || Date.now();
    const durationMs = Math.max(0, end - this.startTime);

    return {
      service: this.service,
      environment: this.environment,
      traceId: this.traceId,
      spanId: this.spanId,
      parentSpanId: this.parentSpanId,
      name: this.name,
      kind: this.kind,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date(end).toISOString(),
      durationMs,
      status: this.status,
      statusCode: this.statusCode,
      errorMessage: this.errorMessage,
      attributes: this.attributes,
      events: this.events.length > 0 ? this.events : undefined,
    };
  }
}

export class Tracer {
  private apiKey: string;
  private endpoint: string;
  private defaultService: string;
  private defaultEnvironment: "prod" | "staging" | "dev";
  private batchSize: number;
  private queue: QueuedSpan[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private activeFlushPromise: Promise<void> | null = null;

  constructor(config: TracerConfig) {
    this.apiKey = config.apiKey;
    this.endpoint =
      config.endpoint || "http://localhost:3000/api/traces/ingest";
    this.defaultService = config.defaultService;
    this.defaultEnvironment = config.defaultEnvironment || "dev";
    this.batchSize = config.batchSize ?? 20;

    const flushIntervalMs = config.flushIntervalMs ?? 2000;
    if (flushIntervalMs > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch((err) => {
          console.error(
            "[ObservabilityOS Tracer] Background flush failed:",
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
  }

  public startSpan(name: string, options?: SpanOptions): Span {
    return new Span(
      name,
      options,
      this.defaultService,
      this.defaultEnvironment,
      (endedSpan) => {
        this.queue.push(endedSpan.toQueuedSpan());
        if (this.queue.length >= this.batchSize) {
          this.flush().catch((err) => {
            console.error(
              "[ObservabilityOS Tracer] Batch buffer flush failed:",
              err,
            );
          });
        }
      },
    );
  }

  public async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T> | T,
    options?: SpanOptions,
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      const result = await fn(span);
      if (span.toQueuedSpan().status === "ok") {
        span.setStatus("ok");
      }
      return result;
    } catch (err) {
      span.setStatus("error", err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      span.end();
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
            `[ObservabilityOS Tracer] Ingest returned ${response.status}:`,
            errorText,
          );
          this.queue.unshift(...itemsToSend);
        } else {
          flushSuccessful = true;
        }
      } catch (err) {
        console.error(
          "[ObservabilityOS Tracer] Connection error during flush:",
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
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
