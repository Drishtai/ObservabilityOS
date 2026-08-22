import { redirect } from "next/navigation";
import { Service, Span } from "@repo/db";
import { getAuthSession } from "@/lib/auth-cache";
import TracesView from "./TracesView";
import { subDays } from "date-fns";
import type { PipelineStage } from "mongoose";

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function TracesPage({ searchParams }: PageProps) {
  const { user, projects } = await getAuthSession();
  const resolvedSearchParams = await searchParams;

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

  const services = await Service.find({ projectId: activeProject._id }).sort({
    name: 1,
  });

  const start24h = subDays(new Date(), 1);

  // Aggregate recent traces for this project in the last 24h
  const pipeline: PipelineStage[] = [
    {
      $match: {
        projectId: activeProject._id,
        startTime: { $gte: start24h },
        name: {
          $not: /^(?:(?:GET|HEAD|OPTIONS)\s+)?(?:\/)?(?:ping|health|healthz|live|ready|readiness|liveness|metrics|prometheus|favicon\.ico)(?:\?.*|\/.*)?$/i,
        },
      },
    },
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
    { $limit: 50 },
  ];

  const traces = await Span.aggregate(pipeline);

  const serviceNameMap = new Map(
    services.map((s) => [s._id.toString(), s.name]),
  );

  const serializedTraces = traces.map((t) => ({
    traceId: t.traceId,
    rootSpanName: t.rootSpanName,
    serviceId: t.serviceId?.toString() || "",
    serviceName:
      serviceNameMap.get(t.serviceId?.toString()) || "unknown-service",
    environment: t.environment || "prod",
    startTime: new Date(t.startTime).toISOString(),
    endTime: new Date(t.endTime).toISOString(),
    durationMs: t.durationMs || 0,
    spanCount: t.spanCount || 1,
    status: t.status as "ok" | "error",
    serviceCount: t.serviceCount || 1,
  }));

  const serializedServices = services.map((s) => ({
    id: s._id.toString(),
    name: s.name,
    environment: s.environment,
  }));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <TracesView
        initialTraces={serializedTraces}
        services={serializedServices}
        projectId={activeProject._id.toString()}
      />
    </div>
  );
}
