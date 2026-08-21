import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { connectToDatabase, Project, Span, Service, Log } from "@repo/db";
import { Types } from "mongoose";

export async function GET(
  request: Request,
  props: { params: Promise<{ traceId: string }> },
) {
  try {
    const params = await props.params;
    const { traceId } = params;
    if (!traceId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "traceId is required" } },
        { status: 400 },
      );
    }

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

    // Fetch all spans belonging to this trace
    const spans = await Span.find({
      projectId: new Types.ObjectId(projectId),
      traceId,
    }).sort({ startTime: 1 });

    if (spans.length === 0) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Trace not found" } },
        { status: 404 },
      );
    }

    // Fetch service mapping
    const services = await Service.find({ projectId: project._id });
    const serviceMap = new Map(
      services.map((s) => [
        s._id.toString(),
        { name: s.name, color: "#6366f1" },
      ]),
    );

    // Compute overall trace metrics
    const startTimes = spans.map((s) => s.startTime.getTime());
    const endTimes = spans.map((s) => s.endTime.getTime());
    const traceStart = Math.min(...startTimes);
    const traceEnd = Math.max(...endTimes);
    const totalDurationMs = Math.max(1, traceEnd - traceStart);

    // Format spans with relative timeline percentages
    const formattedSpans = spans.map((span) => {
      const spanStart = span.startTime.getTime();
      const spanEnd = span.endTime.getTime();
      const offsetMs = Math.max(0, spanStart - traceStart);
      const startPercent = Math.max(
        0,
        Math.min(100, (offsetMs / totalDurationMs) * 100),
      );
      const widthPercent = Math.max(
        0.5,
        Math.min(100 - startPercent, (span.durationMs / totalDurationMs) * 100),
      );

      const serviceInfo = serviceMap.get(span.serviceId.toString());

      return {
        id: span._id.toString(),
        spanId: span.spanId,
        parentSpanId: span.parentSpanId || null,
        name: span.name,
        kind: span.kind || "internal",
        serviceId: span.serviceId.toString(),
        serviceName: serviceInfo?.name || "unknown-service",
        serviceColor: serviceInfo?.color || "#6366f1",
        startTime: span.startTime.toISOString(),
        endTime: span.endTime.toISOString(),
        durationMs: span.durationMs,
        offsetMs,
        startPercent,
        widthPercent,
        status: span.status,
        statusCode: span.statusCode,
        errorMessage: span.errorMessage,
        attributes: span.attributes || {},
        events: span.events || [],
        environment: span.environment,
      };
    });

    // Also fetch associated logs for this trace
    const logs = await Log.find({
      projectId: new Types.ObjectId(projectId),
      traceId,
    })
      .sort({ timestamp: 1 })
      .limit(100);

    const formattedLogs = logs.map((l) => ({
      id: l._id.toString(),
      timestamp: l.timestamp.toISOString(),
      level: l.level,
      message: l.message,
      metadata: l.metadata,
      serviceId: l.serviceId.toString(),
      serviceName: serviceMap.get(l.serviceId.toString())?.name || "service",
    }));

    return NextResponse.json({
      success: true,
      trace: {
        traceId,
        rootSpan: formattedSpans[0],
        totalDurationMs,
        startTime: new Date(traceStart).toISOString(),
        endTime: new Date(traceEnd).toISOString(),
        spanCount: spans.length,
        hasError: spans.some((s) => s.status === "error"),
        spans: formattedSpans,
        logs: formattedLogs,
      },
    });
  } catch (error) {
    console.error("[Trace Detail API Error]:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch trace details",
        },
      },
      { status: 500 },
    );
  }
}
