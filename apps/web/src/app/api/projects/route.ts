import { getAuthenticatedUser } from "@/lib/auth";

import { NextResponse } from "next/server";
import { connectToDatabase, Project, Service, Log, Metric, Incident, Deploy, AuditLog } from "@repo/db";

import { generateApiKey, hashApiKey } from "@/lib/crypto";
import { delCache } from "@/lib/redis";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const projects = await Project.find({ ownerId: user._id }).sort({
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

    const project = await Project.create({
      ownerId: user._id,
      name: name.trim(),
      apiKey: hashedApiKey,
      plan: isSelfHosted ? "self-host" : "free",
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

    await connectToDatabase();

    // Verify project belongs to user (Tenant isolation)
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

    // Cascade delete all dependent documents
    await Promise.all([
      Project.deleteOne({ _id: projectId }),
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
