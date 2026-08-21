import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Project } from "@repo/db";
import { generateApiKey, hashApiKey } from "@/lib/crypto";
import { logAuditEvent } from "@/lib/audit";
import { delCache } from "@/lib/redis";

import { requireProjectPermission } from "@/lib/permissions";

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

    // Verify project permissions (Requires admin or owner)
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "admin",
    );

    if (!authorized || !project) {
      return NextResponse.json(
        {
          error: error || {
            code: "FORBIDDEN",
            message: "Project not found or access denied",
          },
        },
        { status: error?.status || 403 },
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
