import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { connectToDatabase, Project, Log, Metric, Span } from "@repo/db";
import { PLAN_LIMITS } from "@/lib/quota";
import { Types } from "mongoose";

export async function GET(request: Request) {
  try {
    await connectToDatabase();
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "projectId is required" } },
        { status: 400 },
      );
    }

    const project = await Project.findOne({
      _id: projectId,
      ownerId: user._id,
    });
    if (!project) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Project not found or access denied",
          },
        },
        { status: 404 },
      );
    }

    const plan = project.plan || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const retentionDays = limits.retentionDays;

    const thresholdDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const projectObjectId = new Types.ObjectId(projectId);

    // Total counts
    const [
      totalLogs,
      totalMetrics,
      totalSpans,
      expiredLogs,
      expiredMetrics,
      expiredSpans,
    ] = await Promise.all([
      Log.countDocuments({ projectId: projectObjectId }),
      Metric.countDocuments({ projectId: projectObjectId }),
      Span.countDocuments({ projectId: projectObjectId }),
      Log.countDocuments({
        projectId: projectObjectId,
        timestamp: { $lt: thresholdDate },
      }),
      Metric.countDocuments({
        projectId: projectObjectId,
        timestamp: { $lt: thresholdDate },
      }),
      Span.countDocuments({
        projectId: projectObjectId,
        startTime: { $lt: thresholdDate },
      }),
    ]);

    // Oldest record
    const [oldestLog] = await Log.find({ projectId: projectObjectId })
      .sort({ timestamp: 1 })
      .limit(1)
      .select("timestamp");

    return NextResponse.json({
      success: true,
      retention: {
        plan,
        retentionDays,
        thresholdDate: thresholdDate.toISOString(),
        oldestRecordDate: oldestLog?.timestamp?.toISOString() || null,
        totalRecords: totalLogs + totalMetrics + totalSpans,
        totalLogs,
        totalMetrics,
        totalSpans,
        expiredRecords: expiredLogs + expiredMetrics + expiredSpans,
        expiredLogs,
        expiredMetrics,
        expiredSpans,
      },
    });
  } catch (error) {
    console.error("[Project Retention Stats API Error]:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch retention stats",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    await connectToDatabase();
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const rawBody = await request.json();
    const { projectId } = rawBody;

    if (!projectId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "projectId is required" } },
        { status: 400 },
      );
    }

    const project = await Project.findOne({
      _id: projectId,
      ownerId: user._id,
    });
    if (!project) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Project not found or access denied",
          },
        },
        { status: 404 },
      );
    }

    const plan = project.plan || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const retentionDays = limits.retentionDays;

    const thresholdDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    );

    const projectObjectId = new Types.ObjectId(projectId);

    const [deletedLogs, deletedMetrics, deletedSpans] = await Promise.all([
      Log.deleteMany({
        projectId: projectObjectId,
        timestamp: { $lt: thresholdDate },
      }),
      Metric.deleteMany({
        projectId: projectObjectId,
        timestamp: { $lt: thresholdDate },
      }),
      Span.deleteMany({
        projectId: projectObjectId,
        startTime: { $lt: thresholdDate },
      }),
    ]);

    return NextResponse.json({
      success: true,
      purged: {
        retentionDays,
        thresholdDate: thresholdDate.toISOString(),
        deletedLogsCount: deletedLogs.deletedCount,
        deletedMetricsCount: deletedMetrics.deletedCount,
        deletedSpansCount: deletedSpans.deletedCount,
        totalDeleted:
          deletedLogs.deletedCount +
          deletedMetrics.deletedCount +
          deletedSpans.deletedCount,
      },
    });
  } catch (error) {
    console.error("[Project Retention Purge API Error]:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to execute retention purge",
        },
      },
      { status: 500 },
    );
  }
}
