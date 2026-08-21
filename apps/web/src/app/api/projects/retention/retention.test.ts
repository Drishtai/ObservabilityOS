/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET, POST } from "./route";
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
import { getAuthenticatedUser } from "@/lib/auth";
import mongoose from "mongoose";

vi.mock("@/lib/auth", () => ({
  getAuthenticatedUser: vi.fn(),
}));

describe("Project Retention API", () => {
  let project: any;
  let owner: any;

  beforeEach(async () => {
    process.env.MONGODB_URI = "mongodb://localhost:27017/observability_test";
    await connectToDatabase();

    await User.deleteMany({});
    await Project.deleteMany({});
    await Service.deleteMany({});
    await Log.deleteMany({});
    await Metric.deleteMany({});
    await Span.deleteMany({});

    owner = await User.create({
      githubId: "git-retention-test",
      username: "retention_tester",
    });

    vi.mocked(getAuthenticatedUser).mockResolvedValue(owner);

    project = await Project.create({
      name: "Retention Test Project",
      ownerId: owner._id,
      apiKey: hashApiKey("retention_test_key"),
      plan: "free", // 7 days retention
      subscriptionStatus: "active",
      billingProvider: "none",
    });
  });

  afterEach(async () => {
    await mongoose.connection.close();
  });

  it("should return 401 if user is not authenticated", async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null);
    const req = new Request(
      `http://localhost:3000/api/projects/retention?projectId=${project._id.toString()}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("should compute retention stats with expired counts and allow on-demand purge", async () => {
    const now = Date.now();
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000);
    const serviceId = new mongoose.Types.ObjectId();

    await Log.create([
      {
        projectId: project._id,
        serviceId,
        level: "info",
        message: "Old log",
        timestamp: tenDaysAgo,
        environment: "prod",
      },
      {
        projectId: project._id,
        serviceId,
        level: "info",
        message: "Recent log",
        timestamp: twoDaysAgo,
        environment: "prod",
      },
    ]);

    // GET stats
    const getReq = new Request(
      `http://localhost:3000/api/projects/retention?projectId=${project._id.toString()}`,
    );
    const getRes = await GET(getReq);
    expect(getRes.status).toBe(200);

    const getData = await getRes.json();
    expect(getData.success).toBe(true);
    expect(getData.retention.retentionDays).toBe(7);
    expect(getData.retention.totalLogs).toBe(2);
    expect(getData.retention.expiredLogs).toBe(1);

    // POST purge
    const postReq = new Request(
      "http://localhost:3000/api/projects/retention",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project._id.toString() }),
      },
    );

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.purged.deletedLogsCount).toBe(1);

    const remainingLogs = await Log.find({ projectId: project._id });
    expect(remainingLogs.length).toBe(1);
    expect(remainingLogs[0]?.message).toBe("Recent log");
  });
});
