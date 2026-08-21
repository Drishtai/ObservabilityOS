import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetricsCollector, Logger } from "./index";

describe("ObservabilityOS MetricsCollector", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("should initialize with default configs and accept manual metric recordings", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const collector = new MetricsCollector({
      apiKey: "test-metrics-key",
      defaultService: "order-service",
      defaultEnvironment: "prod",
      batchSize: 2,
      flushIntervalMs: 0,
    });

    collector.recordMetric({
      cpuUsage: 25.5,
      memoryUsage: 256.0,
      memoryLimit: 1024.0,
      latencyMs: 35.2,
    });

    expect(fetchMock).not.toHaveBeenCalled();

    collector.recordMetric({
      service: "custom-auth-service",
      environment: "staging",
      cpuUsage: 80.0,
      memoryUsage: 512.0,
      memoryLimit: 2048.0,
      latencyMs: 120.5,
    });

    await vi.runAllTimersAsync();
    await collector["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callArgs = fetchMock.mock.calls[0];
    const [url, options] = callArgs as [string, RequestInit];

    expect(url).toBe("http://localhost:3000/api/metrics/ingest");
    expect(options.method).toBe("POST");
    expect(options.headers).toEqual({
      "Content-Type": "application/json",
      "x-api-key": "test-metrics-key",
    });

    const body = JSON.parse(options.body as string);
    expect(body.length).toBe(2);
    expect(body[0]).toMatchObject({
      service: "order-service",
      environment: "prod",
      cpuUsage: 25.5,
      memoryUsage: 256.0,
      memoryLimit: 1024.0,
      latencyMs: 35.2,
    });
    expect(body[1]).toMatchObject({
      service: "custom-auth-service",
      environment: "staging",
      cpuUsage: 80.0,
      memoryUsage: 512.0,
      memoryLimit: 2048.0,
      latencyMs: 120.5,
    });

    collector.destroy();
  });

  it("should record latency duration and track latency using trackLatency helper", async () => {
    const collector = new MetricsCollector({
      apiKey: "test-metrics-key",
      defaultService: "api-service",
      flushIntervalMs: 0,
    });

    collector.recordLatency(45);
    collector.recordLatency(55);

    const result = await collector.trackLatency(async () => {
      return "operation-done";
    });

    expect(result).toBe("operation-done");
    expect(collector["recordedLatencies"].length).toBe(3);

    const sample = collector.sampleSystemMetrics();
    expect(sample).toBeDefined();
    expect(sample?.latencyMs).toBeGreaterThan(0);
    // Should reset recorded latencies after sampling
    expect(collector["recordedLatencies"].length).toBe(0);

    collector.destroy();
  });

  it("should sample node system metrics and auto-sample on interval", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const collector = new MetricsCollector({
      apiKey: "test-metrics-key",
      defaultService: "payment-service",
      batchSize: 1,
      flushIntervalMs: 0,
      autoSampleIntervalMs: 1000,
    });

    expect(fetchMock).not.toHaveBeenCalled();

    // Advance time to trigger auto sampling
    await vi.advanceTimersByTimeAsync(1000);
    await collector["activeFlushPromise"];

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(options.body as string);

    expect(body.length).toBe(1);
    expect(body[0].service).toBe("payment-service");
    expect(typeof body[0].cpuUsage).toBe("number");
    expect(typeof body[0].memoryUsage).toBe("number");
    expect(typeof body[0].memoryLimit).toBe("number");

    collector.destroy();
  });

  it("should integrate seamlessly with Logger instance when enableMetrics is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const logger = new Logger({
      apiKey: "test-combined-key",
      defaultService: "combined-service",
      batchSize: 1,
      flushIntervalMs: 0,
      enableMetrics: true,
      metricsAutoSampleIntervalMs: 0,
    });

    expect(logger.getMetricsCollector()).not.toBeNull();

    logger.recordMetric({
      cpuUsage: 12.0,
      memoryUsage: 128.0,
      memoryLimit: 512.0,
      latencyMs: 15.0,
    });

    await logger.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://localhost:3000/api/metrics/ingest");
    const body = JSON.parse(options.body as string);
    expect(body[0].cpuUsage).toBe(12.0);

    logger.destroy();
  });
});
