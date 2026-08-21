import { getAuthenticatedUser } from "@/lib/auth";

import { NextResponse } from "next/server";
import { Incident, Comment } from "@repo/db";

import { z } from "zod";
import { requireProjectPermission } from "@/lib/permissions";

const commentCreateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  incidentId: z.string().min(1, "incidentId is required"),
  content: z.string().min(1, "Comment content cannot be empty"),
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
    const { projectId, incidentId, content } =
      commentCreateSchema.parse(rawBody);

    // Tenant check: Ensure user has at least member access to this project
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "member",
    );
    if (!authorized || !project) {
      return NextResponse.json(
        {
          error: error || {
            code: "FORBIDDEN",
            message: "Forbidden: Access denied",
          },
        },
        { status: error?.status || 403 },
      );
    }

    // Verify incident belongs to this project
    const incident = await Incident.findOne({
      _id: incidentId,
      projectId: project._id,
    });
    if (!incident) {
      return NextResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Incident not found in this project",
          },
        },
        { status: 404 },
      );
    }

    // Create the comment
    const comment = await Comment.create({
      incidentId: incident._id,
      userId: user._id,
      content: content.trim(),
    });

    return NextResponse.json(
      {
        comment: {
          id: comment._id.toString(),
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          user: {
            id: user._id.toString(),
            username: user.username,
            avatarUrl: user.avatarUrl || null,
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Comment POST Error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Validation failed",
            details: error.errors,
          },
        },
        { status: 400 },
      );
    }
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create comment",
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
    const commentId = searchParams.get("commentId");

    if (!projectId || !commentId) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "projectId and commentId are required",
          },
        },
        { status: 400 },
      );
    }

    // Tenant check: Ensure user is at least a viewer of this project
    const { authorized, role, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "viewer",
    );
    if (!authorized || !project) {
      return NextResponse.json(
        {
          error: error || {
            code: "FORBIDDEN",
            message: "Forbidden: Access denied",
          },
        },
        { status: error?.status || 403 },
      );
    }

    // Find the comment
    const comment = await Comment.findById(commentId);
    if (!comment) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Comment not found" } },
        { status: 404 },
      );
    }

    // Verify comment belongs to an incident in this project
    const incident = await Incident.findOne({
      _id: comment.incidentId,
      projectId: project._id,
    });
    if (!incident) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden: Comment not associated with this project",
          },
        },
        { status: 403 },
      );
    }

    // Auth check: Only comment author OR project admin/owner can delete comment
    const isCommentAuthor = comment.userId.toString() === user._id.toString();
    const isProjectAdminOrOwner = role === "admin" || role === "owner";

    if (!isCommentAuthor && !isProjectAdminOrOwner) {
      return NextResponse.json(
        {
          error: {
            code: "FORBIDDEN",
            message: "Forbidden: You cannot delete this comment",
          },
        },
        { status: 403 },
      );
    }

    await comment.deleteOne();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Comment DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete comment",
        },
      },
      { status: 500 },
    );
  }
}
