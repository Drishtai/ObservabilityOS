import { NextResponse } from "next/server";
import { connectToDatabase, Project, Log, Metric, Span } from "@repo/db";
import { PLAN_LIMITS } from "@/lib/quota";

export async function GET(request: Request) {
  try {
    // 1. Authenticate Cron Trigger
    const { searchParams } = new URL(request.url);
    const authHeader = request.headers.get("Authorization");
    const secretParam = searchParams.get("secret");

    if (!process.env.CRON_SECRET) {
      console.error("[Cron Data Retention] CRON_SECRET not configured");
      return NextResponse.json(
        {
          error: {
            code: "CONFIG_ERROR",
            message: "Cron secret not configured",
          },
        },
        { status: 500 },
      );
    }

    const isAuthorized =
      authHeader === `Bearer ${process.env.CRON_SECRET}` ||
      secretParam === process.env.CRON_SECRET;

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error: { code: "UNAUTHORIZED", message: "Unauthorized trigger call" },
        },
        { status: 401 },
      );
    }

    // 2. Connect to Database
    await connectToDatabase();

    // 3. Retrieve all projects
    const projects = await Project.find({});
    console.log(
      `[Data Retention Cron] Processing retention for ${projects.length} projects.`,
    );

    const results = [];

    for (const project of projects) {
      const plan = project.plan || "free";
      const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
      const retentionDays = limits.retentionDays;

      const thresholdDate = new Date(
        Date.now() - retentionDays * 24 * 60 * 60 * 1000,
      );

      // Delete logs, metrics, and spans older than the threshold
      const deletedLogs = await Log.deleteMany({
        projectId: project._id,
        timestamp: { $lt: thresholdDate },
      });

      const deletedMetrics = await Metric.deleteMany({
        projectId: project._id,
        timestamp: { $lt: thresholdDate },
      });

      const deletedSpans = await Span.deleteMany({
        projectId: project._id,
        startTime: { $lt: thresholdDate },
      });

      results.push({
        projectId: project._id.toString(),
        projectName: project.name,
        plan,
        retentionDays,
        thresholdDate: thresholdDate.toISOString(),
        deletedLogsCount: deletedLogs.deletedCount,
        deletedMetricsCount: deletedMetrics.deletedCount,
        deletedSpansCount: deletedSpans.deletedCount,
      });
    }

    return NextResponse.json({
      success: true,
      processedProjectsCount: projects.length,
      results,
    });
  } catch (error) {
    console.error("Cron Data Retention Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Cron data retention trigger failed",
        },
      },
      { status: 500 },
    );
  }
}
