# @observability-os/sdk

**Zero-dependency TypeScript logger, metrics sampler, and distributed APM tracing SDK** for [ObservabilityOS](https://github.com/Vaibhav-Singh2/ObservabilityOS).

## Features

- **Zero runtime dependencies** — runs universally in Node.js, Next.js, Edge runtime, and modern browsers with zero external npm dependencies.
- **Client-Side PII Redaction (`scrubber.ts`)** — automatically masks passwords, credit cards, JWT tokens, and authorization headers _before_ transmission.
- **Distributed APM Tracing (`Tracer` & `Span`)** — trace execution trees across microservices with parent-child span hierarchy and latency tracking.
- **System & Latency Metrics Auto-Sampler (`MetricsCollector`)** — periodically captures CPU usage, memory consumption, and tracks execution latency.
- **Batch-and-flush architecture** — logs and spans are queued in memory and flushed asynchronously with exponential retry safety.
- **Timer safety** — uses `.unref()` timers so background workers do not block Node.js process exits.

## Installation

```bash
npm install @observability-os/sdk
# or
yarn add @observability-os/sdk
# or
pnpm add @observability-os/sdk
```

## Quick Start

### 1. Structured Logging & PII Scrubbing

```typescript
import { Logger } from "@observability-os/sdk";

const logger = new Logger({
  apiKey: "your-project-api-key",
  endpoint: "https://your-instance.com/api/ingest",
  defaultService: "payment-api",
  defaultEnvironment: "prod",
  enableMetrics: true, // Enables CPU & Memory auto-sampling
  enableTracing: true, // Enables distributed APM tracing
});

// Logs are scrubbed for PII locally and flushed in batches
logger.info("Payment processed successfully", {
  metadata: {
    userId: "usr_9921",
    amount: 199.99,
    password: "WillBeMaskedAutomatically",
  },
});
```

### 2. Distributed APM Tracing

```typescript
// Trace async operations with automatic error status tracking
const charge = await logger.withSpan("stripe-charge", async (span) => {
  span.setAttribute("customer.id", "cus_8812");
  span.addEvent("validating_card", { attempt: 1 });

  return await stripe.charges.create({ ... });
});
```

### 3. Measuring Latency

```typescript
const queryResult = await logger.trackLatency(async () => {
  return await db.query("SELECT * FROM users WHERE active = true");
});
```

## API Reference

### `LoggerConfig`

| Option               | Type                           | Default                            | Description                                   |
| -------------------- | ------------------------------ | ---------------------------------- | --------------------------------------------- |
| `apiKey`             | `string`                       | —                                  | Project Ingestion API Key                     |
| `endpoint`           | `string`                       | `http://localhost:3000/api/ingest` | Base ingestion endpoint                       |
| `metricsEndpoint`    | `string`                       | `/api/metrics/ingest`              | Metrics ingestion endpoint                    |
| `tracesEndpoint`     | `string`                       | `/api/traces/ingest`               | Traces ingestion endpoint                     |
| `defaultService`     | `string`                       | —                                  | Default service name                          |
| `defaultEnvironment` | `"prod" \| "staging" \| "dev"` | `"dev"`                            | Default deployment environment                |
| `batchSize`          | `number`                       | `20`                               | Items queued before automatic flush           |
| `flushIntervalMs`    | `number`                       | `1000`                             | Milliseconds between background flushes       |
| `enableMetrics`      | `boolean`                      | `false`                            | Enable periodic CPU & memory metrics sampling |
| `enableTracing`      | `boolean`                      | `false`                            | Enable distributed trace span tracking        |

### `Logger` Methods

| Method                                    | Description                                                 |
| ----------------------------------------- | ----------------------------------------------------------- |
| `log(level, message, options?)`           | Log with custom options and local PII scrubbing             |
| `info / warn / error / debug(msg, opts?)` | Convenience log level methods                               |
| `startSpan(name, options?)`               | Start a new distributed trace span                          |
| `withSpan(name, fn, options?)`            | Execute an async function wrapped in a trace span           |
| `trackLatency(fn)`                        | Execute a function and record execution duration            |
| `flush()`                                 | Immediately flush all queued logs, metrics, and trace spans |
| `destroy()`                               | Clean up all timers and background workers                  |

## License

MIT © ObservabilityOS
