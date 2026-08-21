import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Project, Service } from "@repo/db";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";
import { requireProjectPermission } from "@/lib/permissions";

const sloConfigSchema = z.object({
  projectId: z.string().min(1),
  serviceId: z.string().min(1),
  slo: z.object({
    name: z.string().min(1, "SLO name is required"),
    type: z.enum(["availability", "latency"]),
    target: z
      .number()
      .min(0)
      .max(100, "SLO target must be a percentage between 0 and 100"),
    windowDays: z.number().min(1).default(30),
    latencyThresholdMs: z.number().optional(),
  }),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const rawBody = await request.json();
    const { projectId, serviceId, slo } = sloConfigSchema.parse(rawBody);

    // Verify project permissions (Requires member or above)
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "member",
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

    if (!service.slos) {
      service.slos = [];
    }

    const existingIndex = service.slos.findIndex((s) => s.name === slo.name);
    const isUpdate = existingIndex >= 0;

    if (isUpdate) {
      service.slos[existingIndex] = {
        name: slo.name,
        type: slo.type,
        target: slo.target,
        windowDays: slo.windowDays,
        latencyThresholdMs: slo.latencyThresholdMs,
      };
    } else {
      service.slos.push({
        name: slo.name,
        type: slo.type,
        target: slo.target,
        windowDays: slo.windowDays,
        latencyThresholdMs: slo.latencyThresholdMs,
      });
    }

    await service.save();

    await logAuditEvent({
      projectId: project._id.toString(),
      userId: user._id.toString(),
      action: isUpdate ? "slo.update" : "slo.create",
      targetEntity: "service_slo",
      targetId: `${service.name}/${slo.name}`,
      metadata: {
        serviceId: service._id.toString(),
        sloName: slo.name,
        target: slo.target,
        type: slo.type,
      },
    });

    return NextResponse.json({
      success: true,
      service,
    });
  } catch (error) {
    console.error("SLO Configuration Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message:
              "Validation failed: " +
              error.errors.map((e) => e.message).join(", "),
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to configure service SLO",
        },
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
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
    const sloName = searchParams.get("sloName");

    if (!projectId || !serviceId || !sloName) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "projectId, serviceId, and sloName are required",
          },
        },
        { status: 400 },
      );
    }

    // Verify project permissions (Requires admin or above)
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "admin",
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

    if (!service.slos || service.slos.length === 0) {
      return NextResponse.json({ success: true, slos: [] });
    }

    // Filter out the SLO
    service.slos = service.slos.filter(
      (s) => s.name.toLowerCase() !== sloName.toLowerCase(),
    );
    await service.save();

    await logAuditEvent({
      projectId: project._id.toString(),
      userId: user._id.toString(),
      action: "slo.delete",
      targetEntity: "slo",
      targetId: sloName,
      metadata: {
        serviceId,
      },
    });

    return NextResponse.json({ success: true, slos: service.slos });
  } catch (error) {
    console.error("SLO Config DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete SLO target",
        },
      },
      { status: 500 },
    );
  }
}
