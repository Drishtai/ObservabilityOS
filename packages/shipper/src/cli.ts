#!/usr/bin/env node
import { LogShipper } from "./shipper";

function printHelp(): void {
  console.log(`
ObservabilityOS Log Shipper & Sidecar Agent (obs-shipper)

Usage:
  obs-shipper [options]

Options:
  --api-key, -k       ObservabilityOS Project Ingestion API Key (or env OBSERVABILITY_API_KEY)
  --service, -s       Service name label (or env OBSERVABILITY_SERVICE) [default: "app"]
  --env, -e           Environment (prod | staging | dev) [default: "prod"]
  --endpoint          ObservabilityOS API base URL [default: "http://localhost:3000"]
  --tail, -t          Path to log file to tail in real time
  --from-beginning    Read existing file lines from beginning on startup
  --stdin             Stream logs directly from standard input (e.g. app | obs-shipper)
  --enable-metrics    Periodically sample and ship host/container CPU and memory usage
  --batch-size        Max logs per HTTP batch request [default: 25]
  --flush-interval-ms Max milliseconds between batch flushes [default: 1500]
  --help, -h          Show this help message

Examples:
  # Tail a log file and stream to ObservabilityOS:
  obs-shipper --api-key obs_sk_xxx --service payment-api --tail /var/log/app.log

  # Stream from standard input with container metrics:
  docker logs -f my-app | obs-shipper --api-key obs_sk_xxx --service my-app --stdin --enable-metrics
`);
}

function parseArgs(): {
  apiKey?: string;
  service?: string;
  environment?: "prod" | "staging" | "dev";
  endpoint?: string;
  tailFile?: string;
  fromBeginning?: boolean;
  stdin?: boolean;
  enableMetrics?: boolean;
  batchSize?: number;
  flushIntervalMs?: number;
} {
  const args = process.argv.slice(2);
  const parsed: ReturnType<typeof parseArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else if (arg === "--api-key" || arg === "-k") {
      parsed.apiKey = args[++i];
    } else if (arg === "--service" || arg === "-s") {
      parsed.service = args[++i];
    } else if (arg === "--env" || arg === "-e" || arg === "--environment") {
      parsed.environment = args[++i] as "prod" | "staging" | "dev";
    } else if (arg === "--endpoint") {
      parsed.endpoint = args[++i];
    } else if (arg === "--tail" || arg === "-t") {
      parsed.tailFile = args[++i];
    } else if (arg === "--from-beginning") {
      parsed.fromBeginning = true;
    } else if (arg === "--stdin") {
      parsed.stdin = true;
    } else if (arg === "--enable-metrics") {
      parsed.enableMetrics = true;
    } else if (arg === "--batch-size") {
      parsed.batchSize = parseInt(args[++i] || "25", 10);
    } else if (arg === "--flush-interval-ms") {
      parsed.flushIntervalMs = parseInt(args[++i] || "1500", 10);
    }
  }

  return parsed;
}

export async function runCli(): Promise<void> {
  const options = parseArgs();

  const apiKey =
    options.apiKey ||
    process.env.OBSERVABILITY_API_KEY ||
    process.env.OBS_API_KEY;

  if (!apiKey) {
    console.error(
      "[ObservabilityOS Shipper] Error: API Key is required via --api-key or OBSERVABILITY_API_KEY environment variable.",
    );
    process.exit(1);
  }

  const service = options.service || process.env.OBSERVABILITY_SERVICE || "app";

  const environment =
    options.environment ||
    (process.env.OBSERVABILITY_ENV as "prod" | "staging" | "dev") ||
    "prod";

  const endpoint =
    options.endpoint ||
    process.env.OBSERVABILITY_ENDPOINT ||
    "http://localhost:3000";

  console.log(
    `[ObservabilityOS Shipper] Initializing agent for service: "${service}" (${environment}) -> ${endpoint}`,
  );

  const shipper = new LogShipper({
    apiKey,
    endpoint,
    service,
    environment,
    batchSize: options.batchSize,
    flushIntervalMs: options.flushIntervalMs,
    enableMetrics: options.enableMetrics,
  });

  if (options.tailFile) {
    console.log(
      `[ObservabilityOS Shipper] Tailing file: ${options.tailFile} (fromBeginning: ${Boolean(options.fromBeginning)})`,
    );
    shipper.tailFile(options.tailFile, {
      fromBeginning: options.fromBeginning,
    });
  }

  if (options.stdin || (!options.tailFile && !process.stdin.isTTY)) {
    console.log(
      "[ObservabilityOS Shipper] Reading from standard input (stdin)...",
    );
    shipper.startStdin();
  }

  const shutdown = async (signal: string) => {
    console.log(
      `\n[ObservabilityOS Shipper] Received ${signal}. Flushing remaining logs and shutting down...`,
    );
    await shipper.flush();
    shipper.stop();
    console.log(
      `[ObservabilityOS Shipper] Shutdown complete. Total shipped: ${shipper.getIngestedCount()} entries.`,
    );
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error("[ObservabilityOS Shipper] Fatal error:", err);
    process.exit(1);
  });
}
