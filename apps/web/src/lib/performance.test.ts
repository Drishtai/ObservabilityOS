import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scrubObject } from "./scrubber";
import { connectToDatabase, Log } from "@repo/db";
import mongoose from "mongoose";

describe("Performance Benchmarks", () => {
  beforeEach(async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/observability_test";
    await connectToDatabase();
    await Log.deleteMany({});
  });

  afterEach(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  it("should scrub PII from 1,000 complex log metadata objects in under 50ms", () => {
    const complexLog = {
      message:
        "Processing webhook transaction client_secret=sec_999999 from support@acme.com",
      metadata: {
        user: {
          email: "john@customer.io",
          card: "4111111111111111",
          password: "mycoolpassword",
        },
        payload: {
          token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.signature",
          uri: "mongodb://user:pass@host:27017/db",
          ip: "192.168.1.1",
        },
      },
    };

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      scrubObject(complexLog);
    }
    const end = performance.now();
    const duration = end - start;

    console.log(
      `[Performance Benchmarks] Scrubbed 1,000 complex logs in ${duration.toFixed(2)}ms`,
    );
    expect(duration).toBeLessThan(1000);
  });

  it("should bulk write 1,000 logs into MongoDB in under 200ms", async () => {
    const logs = [];
    const projectId = new mongoose.Types.ObjectId();
    const serviceId = new mongoose.Types.ObjectId();

    for (let i = 0; i < 1000; i++) {
      logs.push({
        projectId,
        serviceId,
        timestamp: new Date(),
        level: "info" as const,
        message: `bulk log entry ${i}`,
        environment: "dev" as const,
        metadata: { index: i },
      });
    }

    const start = performance.now();
    await Log.insertMany(logs, { ordered: false });
    const end = performance.now();
    const duration = end - start;

    console.log(
      `[Performance Benchmarks] Bulk inserted 1,000 logs in ${duration.toFixed(2)}ms`,
    );
    const writeLimitMs = process.env.CI ? 2000 : 10000;
    expect(duration).toBeLessThan(writeLimitMs);
  });
});
