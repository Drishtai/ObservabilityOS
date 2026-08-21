import { redirect, notFound } from "next/navigation";
import { Service, Span, Log } from "@repo/db";
import { getAuthSession } from "@/lib/auth-cache";
import WaterfallView from "./WaterfallView";
import { Types } from "mongoose";

interface PageProps {
  params: Promise<{ traceId: string }>;
  searchParams: Promise<{ projectId?: string }>;
}

export default async function TraceDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { user, projects } = await getAuthSession();
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;

  const { traceId } = resolvedParams;

  if (projects.length === 0) {
    redirect("/dashboard");
  }

  const activeProjectId =
    resolvedSearchParams.projectId || projects[0]?._id.toString();
  const activeProject =
    projects.find((p) => p._id.toString() === activeProjectId) || projects[0];

  if (!activeProject) {
    redirect("/dashboard");
  }

  const spans = await Span.find({
    projectId: activeProject._id,
    traceId,
  }).sort({ startTime: 1 });

  if (spans.length === 0) {
    notFound();
  }

  const services = await Service.find({ projectId: activeProject._id });
  const serviceMap = new Map(
    services.map((s) => [s._id.toString(), { name: s.name, color: "#6366f1" }]),
  );

  const startTimes = spans.map((s) => s.startTime.getTime());
  const endTimes = spans.map((s) => s.endTime.getTime());
  const traceStart = Math.min(...startTimes);
  const traceEnd = Math.max(...endTimes);
  const totalDurationMs = Math.max(1, traceEnd - traceStart);

  const formattedSpans = spans.map((span) => {
    const spanStart = span.startTime.getTime();
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
      status: span.status as "ok" | "error" | "unset",
      statusCode: span.statusCode,
      errorMessage: span.errorMessage,
      attributes: (span.attributes as Record<string, unknown>) || {},
      events:
        span.events?.map((e) => ({
          name: e.name,
          timestamp: e.timestamp.toISOString(),
          attributes: (e.attributes as Record<string, unknown>) || {},
        })) || [],
      environment: span.environment,
    };
  });

  const logs = await Log.find({
    projectId: activeProject._id,
    traceId,
  })
    .sort({ timestamp: 1 })
    .limit(100);

  const formattedLogs = logs.map((l) => ({
    id: l._id.toString(),
    timestamp: l.timestamp.toISOString(),
    level: l.level as "error" | "warn" | "info" | "debug",
    message: l.message,
    metadata: (l.metadata as Record<string, unknown>) || {},
    serviceName: serviceMap.get(l.serviceId.toString())?.name || "service",
  }));

  const traceDetail = {
    traceId,
    rootSpan: formattedSpans[0],
    totalDurationMs,
    startTime: new Date(traceStart).toISOString(),
    endTime: new Date(traceEnd).toISOString(),
    spanCount: spans.length,
    hasError: spans.some((s) => s.status === "error"),
    spans: formattedSpans,
    logs: formattedLogs,
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <WaterfallView
        trace={traceDetail}
        projectId={activeProject._id.toString()}
      />
    </div>
  );
}
