import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { connectToDatabase, Project, Span, Service } from "@repo/db";
import { Types, PipelineStage } from "mongoose";

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
    const serviceId = searchParams.get("serviceId") || "all";
    const status = searchParams.get("status") || "all";
    const environment = searchParams.get("environment") || "all";
    const timeRange = searchParams.get("timeRange") || "24h";
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "50", 10)),
    );

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

    const now = Date.now();
    let startTime = now - 24 * 60 * 60 * 1000;
    if (timeRange === "1h") startTime = now - 60 * 60 * 1000;
    else if (timeRange === "7d") startTime = now - 7 * 24 * 60 * 60 * 1000;

    const matchConditions: Record<string, unknown> = {
      projectId: new Types.ObjectId(projectId),
      startTime: { $gte: new Date(startTime) },
    };

    if (serviceId !== "all") {
      matchConditions.serviceId = new Types.ObjectId(serviceId);
    }
    if (status !== "all") {
      matchConditions.status = status;
    }
    if (environment !== "all") {
      matchConditions.environment = environment;
    }

    const pipeline: PipelineStage[] = [
      { $match: matchConditions },
      {
        $group: {
          _id: "$traceId",
          rootSpanName: { $first: "$name" },
          serviceId: { $first: "$serviceId" },
          environment: { $first: "$environment" },
          startTime: { $min: "$startTime" },
          endTime: { $max: "$endTime" },
          durationMs: { $max: "$durationMs" },
          spanCount: { $sum: 1 },
          hasError: {
            $max: {
              $cond: [{ $eq: ["$status", "error"] }, 1, 0],
            },
          },
          services: { $addToSet: "$serviceId" },
        },
      },
      {
        $project: {
          _id: 0,
          traceId: "$_id",
          rootSpanName: 1,
          serviceId: 1,
          environment: 1,
          startTime: 1,
          endTime: 1,
          durationMs: 1,
          spanCount: 1,
          status: {
            $cond: [{ $eq: ["$hasError", 1] }, "error", "ok"],
          },
          serviceCount: { $size: "$services" },
        },
      },
      { $sort: { startTime: -1 as const } },
      { $limit: limit },
    ];

    const traces = await Span.aggregate(pipeline);

    // Populate service names
    const services = await Service.find({ projectId: project._id });
    const serviceNameMap = new Map(
      services.map((s) => [s._id.toString(), s.name]),
    );

    const populatedTraces = traces.map((t) => ({
      ...t,
      serviceName:
        serviceNameMap.get(t.serviceId?.toString()) || "unknown-service",
    }));

    return NextResponse.json({
      success: true,
      traces: populatedTraces,
      count: populatedTraces.length,
    });
  } catch (error) {
    console.error("[Traces List API Error]:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch traces",
        },
      },
      { status: 500 },
    );
  }
}
