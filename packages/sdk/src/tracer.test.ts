import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Tracer, Logger } from "./index";

describe("ObservabilityOS Tracer & Spans", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should create spans, set attributes/events, and flush to /api/traces/ingest", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const tracer = new Tracer({
      apiKey: "test-tracer-key",
      defaultService: "payment-api",
      defaultEnvironment: "prod",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    const span = tracer.startSpan("process-payment", {
      kind: "server",
      attributes: { "http.method": "POST", "http.route": "/api/checkout" },
    });

    expect(span.traceId).toBeDefined();
    expect(span.spanId).toBeDefined();

    span.setAttribute("user.id", "user_12345");
    span.addEvent("validation_complete", { itemsCount: 3 });

    // End span
    span.end();

    await vi.runAllTimersAsync();
    await tracer["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("http://localhost:3000/api/traces/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "test-tracer-key",
    });

    const body = JSON.parse(options.body as string);
    expect(body.length).toBe(1);
    expect(body[0]).toMatchObject({
      name: "process-payment",
      service: "payment-api",
      environment: "prod",
      kind: "server",
      status: "ok",
      traceId: span.traceId,
      spanId: span.spanId,
    });
    expect(body[0].attributes["http.method"]).toBe("POST");
    expect(body[0].attributes["user.id"]).toBe("user_12345");
    expect(body[0].events.length).toBe(1);
    expect(body[0].events[0].name).toBe("validation_complete");

    tracer.destroy();
  });

  it("should support withSpan helper and record errors automatically on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const tracer = new Tracer({
      apiKey: "test-tracer-key",
      defaultService: "checkout-service",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    await expect(
      tracer.withSpan("db-query-charge", async (span) => {
        span.setAttribute("db.table", "charges");
        throw new Error("Connection timed out to database");
      }),
    ).rejects.toThrow("Connection timed out to database");

    await vi.runAllTimersAsync();
    await tracer["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);

    expect(body.length).toBe(1);
    expect(body[0].name).toBe("db-query-charge");
    expect(body[0].status).toBe("error");
    expect(body[0].errorMessage).toBe("Connection timed out to database");

    tracer.destroy();
  });

  it("should integrate tracing seamlessly with Logger instance", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-unified-key",
      defaultService: "unified-service",
      batchSize: 1,
      flushIntervalMs: 0,
      enableTracing: true,
    });

    const result = await logger.withSpan("calculate-tax", async (span) => {
      span.setAttribute("tax.rate", 0.08);
      return 108.0;
    });

    expect(result).toBe(108.0);

    await logger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/traces/ingest");
    const body = JSON.parse(options.body as string);
    expect(body[0].name).toBe("calculate-tax");
    expect(body[0].status).toBe("ok");

    logger.destroy();
  });
});
