import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Logger } from "./index";

describe("ObservabilityOS SDK Logger", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should initialize with correct configuration", () => {
    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      defaultEnvironment: "staging",
      batchSize: 5,
      flushIntervalMs: 2000,
    });

    expect(logger["apiKey"]).toBe("test-key");
    expect(logger["endpoint"]).toBe("http://localhost:3000/api/ingest");
    expect(logger["defaultService"]).toBe("test-service");
    expect(logger["defaultEnvironment"]).toBe("staging");
    expect(logger["batchSize"]).toBe(5);

    logger.destroy();
  });

  it("should queue log entries and flush when batch size is reached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      batchSize: 3,
      flushIntervalMs: 0, // Disable auto flush timer
    });

    logger.info("message 1");
    logger.warn("message 2");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger["queue"].length).toBe(2);

    logger.error("message 3");
    // Should trigger async flush, wait for active promise
    await vi.runAllTimersAsync();
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    const [url, options] = callArgs as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "test-key",
    });

    const body = JSON.parse(options.body as string);
    expect(body.length).toBe(3);
    expect(body[0].message).toBe("message 1");
    expect(body[0].level).toBe("info");
    expect(body[1].message).toBe("message 2");
    expect(body[1].level).toBe("warn");
    expect(body[2].message).toBe("message 3");
    expect(body[2].level).toBe("error");

    expect(logger["queue"].length).toBe(0);
    logger.destroy();
  });

  it("should flush on interval", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      batchSize: 10,
      flushIntervalMs: 1000,
    });

    logger.info("interval test message");
    expect(fetchMock).not.toHaveBeenCalled();

    // Advance time by 1 second
    await vi.advanceTimersByTimeAsync(1000);
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger["queue"].length).toBe(0);

    logger.destroy();
  });

  it("should override default service and environment in individual logs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      defaultEnvironment: "dev",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    logger.debug("debug message", {
      service: "custom-service",
      environment: "prod",
      traceId: "trace-123",
      metadata: { userId: "user-99" },
    });

    await vi.runAllTimersAsync();
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    expect(callArgs).toBeDefined();
    const options = callArgs?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);
    expect(body[0]).toMatchObject({
      level: "debug",
      message: "debug message",
      service: "custom-service",
      environment: "prod",
      traceId: "trace-123",
      metadata: { userId: "user-99" },
    });

    logger.destroy();
  });

  it("should retain logs in queue and retry on API failure", async () => {
    // Mock API returning 500 error
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    logger.info("temporary log");
    await vi.runAllTimersAsync();
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Queue should have the log put back
    expect(logger["queue"].length).toBe(1);
    expect(logger["queue"][0]?.message).toBe("temporary log");

    logger.destroy();
  });

  it("should retain logs in queue and retry on network connection failure", async () => {
    // Mock API throwing fetch exception (network down)
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network Error"));
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    logger.info("network down log");
    await vi.runAllTimersAsync();
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(logger["queue"].length).toBe(1);
    expect(logger["queue"][0]?.message).toBe("network down log");

    logger.destroy();
  });

  it("should clear timer interval on destroy", () => {
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      flushIntervalMs: 1000,
    });

    const timer = logger["flushTimer"];
    expect(timer).not.toBeNull();

    logger.destroy();
    expect(clearIntervalSpy).toHaveBeenCalledWith(timer);
    expect(logger["flushTimer"]).toBeNull();
  });

  it("should locally scrub PII from message and metadata before transmission", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-key",
      defaultService: "test-service",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    logger.info(
      "User john.doe@example.com used Bearer secret_token_12345678 to connect to mongodb://admin:mySecretPass123@cluster0.mongodb.net",
      {
        metadata: {
          password: "SuperSecretPassword!",
          apiKey: "api_key_live_9999",
          creditCard: "4111111111111111",
          email: "alice@domain.org",
          nested: {
            token: "nested_secret_token",
            userEmail: "bob@company.com",
          },
        },
      },
    );

    await vi.runAllTimersAsync();
    await logger["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const options = callArgs?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);

    expect(body[0].message).not.toContain("john.doe@example.com");
    expect(body[0].message).toContain("[EMAIL_REDACTED]");
    expect(body[0].message).not.toContain("secret_token_12345678");
    expect(body[0].message).toContain("Bearer [TOKEN_REDACTED]");
    expect(body[0].message).not.toContain("mySecretPass123");
    expect(body[0].message).toContain(":[PASSWORD_REDACTED]@");

    expect(body[0].metadata.password).toBe("[REDACTED]");
    expect(body[0].metadata.apiKey).toBe("[REDACTED]");
    expect(body[0].metadata.creditCard).toBe("[CARD_REDACTED]");
    expect(body[0].metadata.email).toBe("[EMAIL_REDACTED]");
    expect(body[0].metadata.nested.token).toBe("[REDACTED]");
    expect(body[0].metadata.nested.userEmail).toBe("[EMAIL_REDACTED]");

    logger.destroy();
  });
});
