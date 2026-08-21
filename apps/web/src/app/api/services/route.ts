import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  Project,
  Service,
  Incident,
  Deploy,
  Log,
  Comment,
  Metric,
} from "@repo/db";
import { logAuditEvent } from "@/lib/audit";
import { delCache } from "@/lib/redis";
import { PLAN_LIMITS } from "@/lib/quota";
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

    if (!projectId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "projectId is required" } },
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

    const services = await Service.find({ projectId: project._id }).sort({
      name: 1,
      environment: 1,
    });
    return NextResponse.json({ services });
  } catch (error) {
    console.error("Services GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve services",
        },
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const { projectId, name, environment } = await request.json();
    if (!projectId || !name || !environment) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "projectId, name, and environment are required",
          },
        },
        { status: 400 },
      );
    }

    if (!["prod", "staging", "dev"].includes(environment)) {
      return NextResponse.json(
        {
          error: { code: "BAD_REQUEST", message: "Invalid environment value" },
        },
        { status: 400 },
      );
    }

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

    // Check if service with same name and environment already exists in the project
    const existing = await Service.findOne({
      projectId: project._id,
      name: name.trim(),
      environment,
    });

    if (existing) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "Service already exists with this name and environment",
          },
        },
        { status: 409 },
      );
    }

    // Check service limit based on project plan
    const plan = project.plan || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;
    const serviceCount = await Service.countDocuments({
      projectId: project._id,
    });
    if (serviceCount >= limits.maxServices) {
      return NextResponse.json(
        {
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Service limit reached. Your plan (${plan}) only allows up to ${limits.maxServices} services.`,
          },
        },
        { status: 403 },
      );
    }

    const service = await Service.create({
      projectId: project._id,
      name: name.trim(),
      environment,
    });

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${project._id.toString()}`);

    return NextResponse.json({ service }, { status: 201 });
  } catch (error) {
    console.error("Services POST Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create service",
        },
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const { projectId, serviceId, runbookUrl, troubleshootingSteps } =
      await request.json();
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

    const service = await Service.findOne({
      _id: serviceId,
      projectId: project._id,
    });
    if (!service) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Service not found in this project",
          },
        },
        { status: 404 },
      );
    }

    if (runbookUrl !== undefined) {
      service.runbookUrl = runbookUrl.trim();
    }
    if (troubleshootingSteps !== undefined) {
      service.troubleshootingSteps = troubleshootingSteps;
    }

    await service.save();

    return NextResponse.json({ service });
  } catch (error) {
    console.error("Services PATCH Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update service",
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

    const service = await Service.findOne({
      _id: serviceId,
      projectId: project._id,
    });
    if (!service) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Service not found in this project",
          },
        },
        { status: 404 },
      );
    }

    const serviceName = service.name;
    const serviceEnv = service.environment;

    // Delete service
    await service.deleteOne();

    // Clean up associated resources in background or sequentially
    // In Mongoose / MongoDB Atlas, we delete documents matching the serviceId.

    // Find all incidents to clean up their comments
    const incidentDocs = await Incident.find({ serviceId: service._id });
    const incidentIds = incidentDocs.map((inc: { _id: unknown }) => inc._id);

    await Comment.deleteMany({ incidentId: { $in: incidentIds } });
    await Incident.deleteMany({ serviceId: service._id });
    await Deploy.deleteMany({ serviceId: service._id });
    await Log.deleteMany({ serviceId: service._id });
    await Metric.deleteMany({ serviceId: service._id });

    // Write audit log
    await logAuditEvent({
      projectId: project._id.toString(),
      userId: user._id.toString(),
      action: "service.delete",
      targetEntity: "service",
      targetId: serviceName,
      metadata: {
        name: serviceName,
        environment: serviceEnv,
      },
    });

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${project._id.toString()}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Services DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete service",
        },
      },
      { status: 500 },
    );
  }
}
