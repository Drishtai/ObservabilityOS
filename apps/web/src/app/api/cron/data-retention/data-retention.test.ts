/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GET as cronGET } from "./route";
import {
  connectToDatabase,
  Project,
  Service,
  Log,
  Metric,
  Span,
  User,
} from "@repo/db";
import { hashApiKey } from "@/lib/crypto";
import mongoose from "mongoose";

describe("Data Retention Automated Cron Endpoint", () => {
  let freeProject: any;
  let proProject: any;

  beforeEach(async () => {
    process.env.CRON_SECRET = "test_cron_secret_abc123";
    process.env.MONGODB_URI = "mongodb://localhost:27017/observability_test";
    await connectToDatabase();

    await User.deleteMany({});
    await Project.deleteMany({});
    await Service.deleteMany({});
    await Log.deleteMany({});
    await Metric.deleteMany({});
    await Span.deleteMany({});

    const user = await User.create({
      githubId: "git-cron-user",
      username: "cron_user",
    });

    freeProject = await Project.create({
      name: "Free Retention Test Project",
      ownerId: user._id,
      apiKey: hashApiKey("free_key_123"),
      plan: "free", // 7 days retention
      subscriptionStatus: "active",
      billingProvider: "none",
    });

    proProject = await Project.create({
      name: "Pro Retention Test Project",
      ownerId: user._id,
      apiKey: hashApiKey("pro_key_123"),
      plan: "pro", // 30 days retention
      subscriptionStatus: "active",
      billingProvider: "none",
    });
  });

  afterEach(async () => {
    await mongoose.connection.close();
  });

  it("should return 401 if cron secret is invalid or missing", async () => {
    const req = new Request("http://localhost:3000/api/cron/data-retention");
    const res = await cronGET(req);
    expect(res.status).toBe(401);
  });

  it("should purge logs, metrics, and spans older than plan retention limits", async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
    const fortyDaysAgo = new Date(now - 40 * 24 * 60 * 60 * 1000);
    const serviceId = new mongoose.Types.ObjectId();

    // Free project (7 days limit)
    // 1 expired log, 1 valid log
    await Log.create([
      {
        projectId: freeProject._id,
        serviceId,
        level: "info",
        message: "Old log 10d",
        timestamp: tenDaysAgo,
        environment: "prod",
      },
      {
        projectId: freeProject._id,
        serviceId,
        level: "info",
        message: "Fresh log 3d",
        timestamp: threeDaysAgo,
        environment: "prod",
      },
    ]);

    // 1 expired metric, 1 valid metric
    await Metric.create([
      {
        projectId: freeProject._id,
        serviceId,
        cpuUsage: 45,
        memoryUsage: 512,
        memoryLimit: 1024,
        latencyMs: 120,
        timestamp: tenDaysAgo,
        environment: "prod",
      },
      {
        projectId: freeProject._id,
        serviceId,
        cpuUsage: 30,
        memoryUsage: 256,
        memoryLimit: 1024,
        latencyMs: 80,
        timestamp: threeDaysAgo,
        environment: "prod",
      },
    ]);

    // 1 expired span, 1 valid span
    await Span.create([
      {
        projectId: freeProject._id,
        serviceId,
        traceId: "tr_old",
        spanId: "sp_old",
        name: "Old Span 10d",
        startTime: tenDaysAgo,
        endTime: tenDaysAgo,
        durationMs: 50,
        status: "ok",
        environment: "prod",
      },
      {
        projectId: freeProject._id,
        serviceId,
        traceId: "tr_fresh",
        spanId: "sp_fresh",
        name: "Fresh Span 3d",
        startTime: threeDaysAgo,
        endTime: threeDaysAgo,
        durationMs: 50,
        status: "ok",
        environment: "prod",
      },
    ]);

    // Pro project (30 days limit)
    // 1 log 40d ago (should be purged), 1 log 10d ago (should be kept because < 30d)
    await Log.create([
      {
        projectId: proProject._id,
        serviceId,
        level: "info",
        message: "Pro Old log 40d",
        timestamp: fortyDaysAgo,
        environment: "prod",
      },
      {
        projectId: proProject._id,
        serviceId,
        level: "info",
        message: "Pro Keep log 10d",
        timestamp: tenDaysAgo,
        environment: "prod",
      },
    ]);

    const req = new Request(
      "http://localhost:3000/api/cron/data-retention?secret=test_cron_secret_abc123",
    );

    const res = await cronGET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify database counts for Free Project
    const freeRemainingLogs = await Log.find({ projectId: freeProject._id });
    expect(freeRemainingLogs.length).toBe(1);
    expect(freeRemainingLogs[0]?.message).toBe("Fresh log 3d");

    const freeRemainingMetrics = await Metric.find({
      projectId: freeProject._id,
    });
    expect(freeRemainingMetrics.length).toBe(1);

    const freeRemainingSpans = await Span.find({ projectId: freeProject._id });
    expect(freeRemainingSpans.length).toBe(1);
    expect(freeRemainingSpans[0]?.name).toBe("Fresh Span 3d");

    // Verify database counts for Pro Project
    const proRemainingLogs = await Log.find({ projectId: proProject._id });
    expect(proRemainingLogs.length).toBe(1);
    expect(proRemainingLogs[0]?.message).toBe("Pro Keep log 10d");
  });
});
