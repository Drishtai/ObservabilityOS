import { scrubText, scrubObject } from "@observability-os/sdk";

export interface ParsedLogEntry {
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
}

const LEVEL_REGEX =
  /\b(error|err|fatal|panic|warn|warning|info|information|debug|trace|verbose)\b/i;
const ISO_TIMESTAMP_REGEX =
  /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/;
const HTTP_STATUS_REGEX = /\s([1-5]\d{2})\s/;

function normalizeLevel(raw: string): "error" | "warn" | "info" | "debug" {
  const lower = raw.toLowerCase();
  if (["error", "err", "fatal", "panic"].includes(lower)) return "error";
  if (["warn", "warning"].includes(lower)) return "warn";
  if (["debug", "trace", "verbose"].includes(lower)) return "debug";
  return "info";
}

/**
 * Robust zero-dependency log line parser supporting JSON (Docker, Pino, Winston),
 * Common Web/Nginx/Apache formats, Syslog, and plain text.
 */
export function parseLogLine(line: string): ParsedLogEntry {
  const trimmed = line.trim();
  if (!trimmed) {
    return {
      timestamp: new Date().toISOString(),
      level: "info",
      message: "",
    };
  }

  // 1. Attempt JSON parsing (Docker JSON format, Pino, Winston, Winston-Express, etc.)
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        // Docker JSON log container format: { "log": "...", "stream": "stderr", "time": "..." }
        if (typeof parsed.log === "string") {
          const innerLine = parsed.log.trim();
          const stream = parsed.stream === "stderr" ? "error" : "info";
          const subParsed = parseLogLine(innerLine);

          return {
            timestamp: parsed.time || subParsed.timestamp,
            level: stream === "error" ? "error" : subParsed.level,
            message: scrubText(subParsed.message || innerLine),
            metadata: scrubObject({
              stream: parsed.stream,
              ...(subParsed.metadata || {}),
            }) as Record<string, unknown>,
          };
        }

        // Standard structured JSON logging
        const timestamp =
          parsed.time ||
          parsed.timestamp ||
          parsed["@timestamp"] ||
          new Date().toISOString();

        const rawLevel =
          parsed.level ||
          parsed.severity ||
          parsed.logLevel ||
          parsed.lvl ||
          "info";

        let level: "error" | "warn" | "info" | "debug" = "info";
        if (typeof rawLevel === "number") {
          // Pino numeric levels: 10=trace, 20=debug, 30=info, 40=warn, 50=error, 60=fatal
          if (rawLevel >= 50) level = "error";
          else if (rawLevel >= 40) level = "warn";
          else if (rawLevel < 30) level = "debug";
          else level = "info";
        } else if (typeof rawLevel === "string") {
          level = normalizeLevel(rawLevel);
        }

        const message =
          parsed.message ||
          parsed.msg ||
          parsed.log ||
          parsed.error ||
          JSON.stringify(parsed);

        const metadata: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (
            ![
              "message",
              "msg",
              "level",
              "severity",
              "logLevel",
              "lvl",
              "time",
              "timestamp",
              "@timestamp",
            ].includes(k)
          ) {
            metadata[k] = v;
          }
        }

        return {
          timestamp:
            typeof timestamp === "string"
              ? timestamp
              : new Date(timestamp).toISOString(),
          level,
          message: scrubText(String(message)),
          metadata:
            Object.keys(metadata).length > 0
              ? (scrubObject(metadata) as Record<string, unknown>)
              : undefined,
        };
      }
    } catch {
      // Fallback to text parsing
    }
  }

  // 2. Extract Timestamp
  let timestamp = new Date().toISOString();
  const timeMatch = trimmed.match(ISO_TIMESTAMP_REGEX);
  if (timeMatch && timeMatch[0]) {
    try {
      const parsedDate = new Date(timeMatch[0]);
      if (!isNaN(parsedDate.getTime())) {
        timestamp = parsedDate.toISOString();
      }
    } catch {
      // keep fallback
    }
  }

  // 3. Extract Level
  let level: "error" | "warn" | "info" | "debug" = "info";
  const levelMatch = trimmed.match(LEVEL_REGEX);
  if (levelMatch && levelMatch[1]) {
    level = normalizeLevel(levelMatch[1]);
  } else {
    // Check for HTTP 4xx / 5xx error status in access log format
    const statusMatch = trimmed.match(HTTP_STATUS_REGEX);
    if (statusMatch && statusMatch[1]) {
      const statusCode = parseInt(statusMatch[1], 10);
      if (statusCode >= 500) level = "error";
      else if (statusCode >= 400) level = "warn";
    }
  }

  return {
    timestamp,
    level,
    message: scrubText(trimmed),
  };
}
