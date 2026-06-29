import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Project } from "@repo/db";
import { generateApiKey, hashApiKey } from "@/lib/crypto";
import { logAuditEvent } from "@/lib/audit";
import { delCache } from "@/lib/redis";

export async function POST(request: Request) {
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

    // Generate new keys
    const plainApiKey = generateApiKey();
    const hashedApiKey = hashApiKey(plainApiKey);

    // Save hashed key to database
    project.apiKey = hashedApiKey;
    await project.save();

    // Log the audit event
    await logAuditEvent({
      projectId: project._id.toString(),
      userId: user._id.toString(),
      action: "project.rotate_key",
      targetEntity: "project",
      targetId: project._id.toString(),
    });

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${project._id.toString()}`);

    return NextResponse.json({
      success: true,
      plainApiKey,
    });
  } catch (error) {
    console.error("Project key regeneration Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to regenerate project API key",
        },
      },
      { status: 500 },
    );
  }
}
