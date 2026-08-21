/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as ingestPOST } from "./ingest/route";
import { GET as listGET } from "./route";
import { GET as detailGET } from "./[traceId]/route";
import { connectToDatabase, Project, Service, Span, User } from "@repo/db";
import { hashApiKey } from "@/lib/crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedUser } from "@/lib/auth";
import mongoose from "mongoose";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

describe("Traces API Endpoints", () => {
  let project: any;
  let owner: any;
  const rawApiKey = "obs_sk_trace_test_key_9999";
  const hashedKey = hashApiKey(rawApiKey);

  beforeEach(async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/observability_test";
    await connectToDatabase();

    await User.deleteMany({});
    await Project.deleteMany({});
    await Service.deleteMany({});
    await Span.deleteMany({});

    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(checkRateLimit).mockResolvedValue({ allowed: true, count: 1 });

    owner = await User.create({
      githubId: "git-trace-test",
      username: "trace_test_user",
    });

    vi.mocked(getAuthenticatedUser).mockResolvedValue(owner);

    project = await Project.create({
      name: "Trace Test Project",
      ownerId: owner._id,
      apiKey: hashedKey,
      plan: "pro",
      subscriptionStatus: "active",
      billingProvider: "none",
    });
  });

  afterEach(async () => {
    await mongoose.connection.close();
  });

  it("should return 401 if x-api-key is missing on trace ingestion", async () => {
    const req = new Request("http://localhost:3000/api/traces/ingest", {
      method: "POST",
      body: JSON.stringify({
        service: "auth-service",
        traceId: "tr_1",
        spanId: "sp_1",
        name: "login",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
      }),
    });

    const res = await ingestPOST(req);
    expect(res.status).toBe(401);
  });

  it("should successfully ingest single and batched spans into database", async () => {
    const now = new Date();
    const spanPayload = [
      {
        service: "gateway-service",
        environment: "prod",
        traceId: "trace_abc_123",
        spanId: "span_root",
        name: "HTTP POST /api/checkout",
        kind: "server",
        startTime: now.toISOString(),
        endTime: new Date(now.getTime() + 150).toISOString(),
        durationMs: 150,
        status: "ok",
        attributes: {
          "http.route": "/api/checkout",
          password: "SecretPassword123",
        },
      },
      {
        service: "payment-service",
        environment: "prod",
        traceId: "trace_abc_123",
        spanId: "span_child_1",
        parentSpanId: "span_root",
        name: "Stripe.charges.create",
        kind: "client",
        startTime: new Date(now.getTime() + 20).toISOString(),
        endTime: new Date(now.getTime() + 120).toISOString(),
        durationMs: 100,
        status: "ok",
      },
    ];

    const req = new Request("http://localhost:3000/api/traces/ingest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": rawApiKey,
      },
      body: JSON.stringify(spanPayload),
    });

    const res = await ingestPOST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);

    const savedSpans = await Span.find({ traceId: "trace_abc_123" });
    expect(savedSpans.length).toBe(2);
    // PII should be redacted
    expect(savedSpans[0]?.attributes.password).toBe("[REDACTED]");
  });

  it("should list traces for a project and calculate metrics", async () => {
    // Ingest a trace
    const now = new Date();
    await Span.create({
      projectId: project._id,
      serviceId: new mongoose.Types.ObjectId(),
      traceId: "trace_list_test",
      spanId: "span_1",
      name: "GET /api/items",
      startTime: now,
      endTime: new Date(now.getTime() + 80),
      durationMs: 80,
      status: "ok",
      environment: "prod",
    });

    const listReq = new Request(
      `http://localhost:3000/api/traces?projectId=${project._id.toString()}`,
    );

    const res = await listGET(listReq);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.traces.length).toBe(1);
    expect(data.traces[0].traceId).toBe("trace_list_test");
    expect(data.traces[0].rootSpanName).toBe("GET /api/items");
    expect(data.traces[0].durationMs).toBe(80);
  });

  it("should retrieve detailed trace tree with relative offsets for waterfall view", async () => {
    const sId = new mongoose.Types.ObjectId();
    const now = new Date();
    await Span.create({
      projectId: project._id,
      serviceId: sId,
      traceId: "trace_waterfall_test",
      spanId: "root_span",
      name: "Root Operation",
      startTime: now,
      endTime: new Date(now.getTime() + 200),
      durationMs: 200,
      status: "ok",
      environment: "prod",
    });

    const detailReq = new Request(
      `http://localhost:3000/api/traces/trace_waterfall_test?projectId=${project._id.toString()}`,
    );

    const res = await detailGET(detailReq, {
      params: Promise.resolve({ traceId: "trace_waterfall_test" }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.trace.traceId).toBe("trace_waterfall_test");
    expect(data.trace.totalDurationMs).toBe(200);
    expect(data.trace.spans.length).toBe(1);
    expect(data.trace.spans[0].startPercent).toBe(0);
  });
});
