import { Logger } from "@observability-os/sdk";
import { parseLogLine } from "./parser";
import { FileTailer, TailerOptions, streamStdin } from "./tailer";

export interface ShipperConfig {
  apiKey: string;
  endpoint?: string;
  service: string;
  environment?: "prod" | "staging" | "dev";
  batchSize?: number;
  flushIntervalMs?: number;
  enableMetrics?: boolean;
  metricsAutoSampleIntervalMs?: number;
}

export class LogShipper {
  private config: ShipperConfig;
  private logger: Logger;
  private tailers: FileTailer[] = [];
  private stdinStopFn: (() => void) | null = null;
  private ingestedCount = 0;

  constructor(config: ShipperConfig) {
    this.config = config;
    const baseEndpoint =
      config.endpoint ||
      process.env.OBSERVABILITY_ENDPOINT ||
      "http://localhost:3000";

    const logEndpoint = baseEndpoint.endsWith("/api/ingest")
      ? baseEndpoint
      : `${baseEndpoint.replace(/\/+$/, "")}/api/ingest`;

    const metricsEndpoint = baseEndpoint.endsWith("/api/metrics/ingest")
      ? baseEndpoint
      : `${baseEndpoint.replace(/\/+$/, "")}/api/metrics/ingest`;

    this.logger = new Logger({
      apiKey: config.apiKey,
      endpoint: logEndpoint,
      metricsEndpoint,
      defaultService: config.service,
      defaultEnvironment: config.environment || "prod",
      batchSize: config.batchSize ?? 25,
      flushIntervalMs: config.flushIntervalMs ?? 1500,
      enableMetrics: config.enableMetrics ?? false,
      metricsAutoSampleIntervalMs: config.metricsAutoSampleIntervalMs ?? 10000,
    });
  }

  /**
   * Process and ship an individual raw string line.
   */
  public ingestLine(rawLine: string): void {
    const parsed = parseLogLine(rawLine);
    this.logger.log(parsed.level, parsed.message, {
      service: this.config.service,
      environment: this.config.environment || "prod",
      timestamp: parsed.timestamp,
      metadata: parsed.metadata,
    });
    this.ingestedCount++;
  }

  /**
   * Tail a specific log file in real time.
   */
  public tailFile(filePath: string, options?: TailerOptions): FileTailer {
    const tailer = new FileTailer(filePath, options);
    tailer.on("line", (line) => {
      this.ingestLine(line);
    });

    tailer.on("error", (err) => {
      console.error(
        `[ObservabilityOS Shipper] Error tailing ${filePath}:`,
        err,
      );
    });

    tailer.start();
    this.tailers.push(tailer);
    return tailer;
  }

  /**
   * Stream logs from standard input.
   */
  public startStdin(): void {
    if (this.stdinStopFn) return;
    this.stdinStopFn = streamStdin((line) => {
      this.ingestLine(line);
    });
  }

  public getIngestedCount(): number {
    return this.ingestedCount;
  }

  public async flush(): Promise<void> {
    await this.logger.flush();
  }

  public stop(): void {
    for (const tailer of this.tailers) {
      tailer.stop();
    }
    this.tailers = [];

    if (this.stdinStopFn) {
      this.stdinStopFn();
      this.stdinStopFn = null;
    }

    this.logger.destroy();
  }
}
