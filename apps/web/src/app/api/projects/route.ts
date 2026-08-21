import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import {
  connectToDatabase,
  Project,
  Membership,
  Service,
  Log,
  Metric,
  Incident,
  Deploy,
  AuditLog,
} from "@repo/db";
import { generateApiKey, hashApiKey } from "@/lib/crypto";
import { delCache } from "@/lib/redis";
import {
  getUserAccessibleProjectIds,
  requireProjectPermission,
} from "@/lib/permissions";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const accessibleProjectIds = await getUserAccessibleProjectIds(user._id);

    const projects = await Project.find({
      _id: { $in: accessibleProjectIds },
    }).sort({
      createdAt: -1,
    });
    return NextResponse.json({ projects });
  } catch (error) {
    console.error("Projects GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve projects",
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

    const { name } = await request.json();
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "Project name is required" } },
        { status: 400 },
      );
    }

    const plainApiKey = generateApiKey();
    const hashedApiKey = hashApiKey(plainApiKey);

    const isSelfHosted = !process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET;

    await connectToDatabase();

    const project = await Project.create({
      ownerId: user._id,
      name: name.trim(),
      apiKey: hashedApiKey,
      plan: isSelfHosted ? "self-host" : "free",
    });

    // Create owner membership
    await Membership.create({
      projectId: project._id,
      userId: user._id,
      role: "admin",
    });

    return NextResponse.json({ project, plainApiKey }, { status: 201 });
  } catch (error) {
    console.error("Projects POST Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create project",
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

    const { projectId } = await request.json();
    if (!projectId) {
      return NextResponse.json(
        { error: { code: "BAD_REQUEST", message: "projectId is required" } },
        { status: 400 },
      );
    }

    // Verify project permissions (Requires admin or owner)
    const { authorized, error } = await requireProjectPermission(
      user._id,
      projectId,
      "admin",
    );

    if (!authorized) {
      return NextResponse.json(
        { error: error || { code: "FORBIDDEN", message: "Access denied" } },
        { status: error?.status || 403 },
      );
    }

    // Cascade delete all dependent documents
    await Promise.all([
      Project.deleteOne({ _id: projectId }),
      Membership.deleteMany({ projectId }),
      Service.deleteMany({ projectId }),
      Log.deleteMany({ projectId }),
      Metric.deleteMany({ projectId }),
      Incident.deleteMany({ projectId }),
      Deploy.deleteMany({ projectId }),
      AuditLog.deleteMany({ projectId }),
    ]);

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${projectId}`);

    return NextResponse.json({ success: true, message: "Project deleted successfully" });
  } catch (error) {
    console.error("Projects DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete project",
        },
      },
      { status: 500 },
    );
  }
}
