import { getAuthenticatedUser } from "@/lib/auth";

import { NextResponse } from "next/server";
import { Project, Service, Log } from "@repo/db";

import { requireProjectPermission } from "@/lib/permissions";

export async function GET(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const serviceId = searchParams.get("serviceId");

    if (!projectId || !serviceId) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "projectId and serviceId are required",
          },
        },
        { status: 400 },
      );
    }

    // Verify project permissions (Requires viewer or above)
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "viewer",
    );
    if (!authorized || !project) {
      return NextResponse.json(
        {
          error: error || {
            code: "NOT_FOUND",
            message: "Project not found or access denied",
          },
        },
        { status: error?.status || 404 },
      );
    }

    // Find service
    const service = await Service.findOne({
      _id: serviceId,
      projectId: project._id,
    });
    if (!service) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Service not found under this project",
          },
        },
        { status: 404 },
      );
    }

    const slos = service.slos || [];
    const statusResults = [];

    const now = new Date();

    for (const slo of slos) {
      const startTime = new Date(
        now.getTime() - slo.windowDays * 24 * 60 * 60 * 1000,
      );
      let totalCount = 0;
      let badCount = 0;

      if (slo.type === "availability") {
        // Count total logs in window
        totalCount = await Log.countDocuments({
          projectId: project._id,
          serviceId: service._id,
          environment: service.environment,
          timestamp: { $gte: startTime },
        });

        // Count error logs in window
        badCount = await Log.countDocuments({
          projectId: project._id,
          serviceId: service._id,
          environment: service.environment,
          level: "error",
          timestamp: { $gte: startTime },
        });
      } else if (slo.type === "latency") {
        const threshold = slo.latencyThresholdMs ?? 500;

        // Count logs with latency metadata
        totalCount = await Log.countDocuments({
          projectId: project._id,
          serviceId: service._id,
          environment: service.environment,
          timestamp: { $gte: startTime },
          $or: [
            { "metadata.latencyMs": { $exists: true } },
            { "metadata.latency": { $exists: true } },
          ],
        });

        // Count logs exceeding threshold
        badCount = await Log.countDocuments({
          projectId: project._id,
          serviceId: service._id,
          environment: service.environment,
          timestamp: { $gte: startTime },
          $or: [
            { "metadata.latencyMs": { $gt: threshold } },
            { "metadata.latency": { $gt: threshold } },
          ],
        });
      }

      const goodCount = totalCount - badCount;
      const compliance =
        totalCount > 0 ? (goodCount / totalCount) * 100 : 100.0;

      // Error Budget Calculations
      const allowedFailureRate = (100 - slo.target) / 100;
      const totalBudget = totalCount * allowedFailureRate;
      const budgetRemaining = totalBudget - badCount;
      const budgetRemainingPercent =
        totalBudget > 0 ? (budgetRemaining / totalBudget) * 100 : 100.0;

      // Status indicator based on remaining budget
      let status: "healthy" | "warning" | "breached" = "healthy";
      if (budgetRemaining < 0 || compliance < slo.target) {
        status = "breached";
      } else if (budgetRemainingPercent < 50) {
        status = "warning";
      }

      statusResults.push({
        name: slo.name,
        type: slo.type,
        target: slo.target,
        windowDays: slo.windowDays,
        latencyThresholdMs: slo.latencyThresholdMs,
        compliance: Number(compliance.toFixed(3)),
        totalRequests: totalCount,
        goodRequests: goodCount,
        badRequests: badCount,
        budgetRemaining: Number(budgetRemaining.toFixed(1)),
        budgetRemainingPercent: Number(budgetRemainingPercent.toFixed(1)),
        status,
      });
    }

    return NextResponse.json({ slos: statusResults });
  } catch (error) {
    console.error("SLO Status Calculation GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to calculate SLO status",
        },
      },
      { status: 500 },
    );
  }
}
