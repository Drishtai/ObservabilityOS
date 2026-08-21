import { describe, it, expect } from "vitest";
import { parseLogLine } from "./parser";

describe("Log Line Parser (Docker JSON, Pino, Access Logs, Plain Text)", () => {
  it("should parse Docker container JSON output with stream metadata and scrub PII", () => {
    const dockerLine = JSON.stringify({
      log: '{"message": "User authenticated", "userId": "usr_99", "password": "SuperSecretPassword123"}',
      stream: "stdout",
      time: "2026-08-21T12:00:00.000Z",
    });

    const parsed = parseLogLine(dockerLine);
    expect(parsed.timestamp).toBe("2026-08-21T12:00:00.000Z");
    expect(parsed.level).toBe("info");
    expect(parsed.message).toContain("User authenticated");
    expect(parsed.metadata?.userId).toBe("usr_99");
    expect(parsed.metadata?.password).toBe("[REDACTED]");
    expect(parsed.metadata?.stream).toBe("stdout");
  });

  it("should parse Pino structured JSON logs and map numeric levels", () => {
    const pinoError = JSON.stringify({
      level: 50,
      time: 1771675200000,
      msg: "Database connection failed",
      err: { message: "ETIMEDOUT", stack: "..." },
      service: "payment-db",
    });

    const parsed = parseLogLine(pinoError);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("Database connection failed");
    expect(parsed.metadata?.service).toBe("payment-db");
  });

  it("should parse HTTP access log format and extract 5xx/4xx error levels", () => {
    const accessLog =
      '192.168.1.1 - - [21/Aug/2026:12:34:56 +0000] "POST /api/checkout HTTP/1.1" 500 234';

    const parsed = parseLogLine(accessLog);
    expect(parsed.level).toBe("error");
    expect(parsed.message).toContain("POST /api/checkout");
  });

  it("should parse plain text logs with bracketed severity", () => {
    const textLog =
      "[2026-08-21T10:15:30Z] [WARN] Cache miss for key user:profile:123";

    const parsed = parseLogLine(textLog);
    expect(parsed.level).toBe("warn");
    expect(parsed.timestamp).toBe("2026-08-21T10:15:30.000Z");
    expect(parsed.message).toContain("Cache miss for key");
  });
});
