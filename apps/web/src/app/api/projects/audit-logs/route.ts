import { getAuthenticatedUser } from "@/lib/auth";

import { NextResponse } from "next/server";
import { Project, AuditLog } from "@repo/db";

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

    // Retrieve audit logs populated with user info
    const logs = await AuditLog.find({ projectId: project._id })
      .populate("userId", "username email avatarUrl")
      .sort({ createdAt: -1 })
      .limit(100);

    const serialized = logs.map((log) => {
      const u = log.userId as unknown as {
        _id: { toString: () => string };
        username: string;
        email?: string | null;
        avatarUrl?: string | null;
      } | null;
      return {
        id: log._id.toString(),
        action: log.action,
        targetEntity: log.targetEntity,
        targetId: log.targetId || null,
        metadata: log.metadata
          ? log.metadata instanceof Map
            ? Object.fromEntries(log.metadata.entries())
            : (log.metadata as Record<string, unknown>)
          : {},
        createdAt: log.createdAt.toISOString(),
        user: u
          ? {
              id: u._id.toString(),
              username: u.username,
              email: u.email || null,
              avatarUrl: u.avatarUrl || null,
            }
          : null,
      };
    });

    return NextResponse.json({ auditLogs: serialized });
  } catch (error) {
    console.error("Audit Logs GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve audit logs",
        },
      },
      { status: 500 },
    );
  }
}
