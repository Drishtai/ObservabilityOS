import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LogShipper } from "./shipper";

describe("LogShipper Agent Integration", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should process raw lines, parse structured data, and ship to API ingest endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const shipper = new LogShipper({
      apiKey: "test_shipper_key",
      endpoint: "http://localhost:3000",
      service: "nginx-ingress",
      environment: "prod",
      batchSize: 1,
      flushIntervalMs: 0,
    });

    shipper.ingestLine(
      '{"time":"2026-08-21T12:00:00Z","level":"error","msg":"Upstream timed out","upstream":"10.0.0.5"}',
    );

    expect(shipper.getIngestedCount()).toBe(1);

    await shipper.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toBe("http://localhost:3000/api/ingest");
    expect(options.headers).toMatchObject({
      "Content-Type": "application/json",
      "x-api-key": "test_shipper_key",
    });

    const body = JSON.parse(options.body as string);
    expect(body.length).toBe(1);
    expect(body[0]).toMatchObject({
      service: "nginx-ingress",
      environment: "prod",
      level: "error",
      message: "Upstream timed out",
    });
    expect(body[0].metadata?.upstream).toBe("10.0.0.5");

    shipper.stop();
  });
});
