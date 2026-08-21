import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { connectToDatabase, Membership, Project, User } from "@repo/db";
import { requireProjectPermission } from "@/lib/permissions";
import { logAuditEvent } from "@/lib/audit";
import { z } from "zod";
import { Types } from "mongoose";

const addMemberSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  usernameOrEmail: z.string().min(1, "Username or email is required"),
  role: z.enum(["admin", "member", "viewer"]).default("member"),
});

const updateMemberSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  membershipId: z.string().min(1, "membershipId is required"),
  role: z.enum(["admin", "member", "viewer"]),
});

const deleteMemberSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  membershipId: z.string().min(1, "membershipId is required"),
});

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

    const { authorized, role, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "viewer",
    );

    if (!authorized || !project) {
      return NextResponse.json(
        { error: error || { code: "NOT_FOUND", message: "Project not found or access denied" } },
        { status: error?.status || 404 },
      );
    }

    await connectToDatabase();

    // Fetch Project Owner
    const ownerUser = await User.findById(project.ownerId).select("username email avatarUrl");

    // Fetch all members for this project
    const memberships = await Membership.find({ projectId })
      .populate<{ userId: { _id: Types.ObjectId; username: string; email?: string; avatarUrl?: string } }>(
        "userId",
        "username email avatarUrl",
      )
      .sort({ createdAt: 1 });

    const formattedMembers = memberships
      .filter((m) => m.userId && m.userId._id.toString() !== project.ownerId.toString())
      .map((m) => ({
        id: m._id.toString(),
        userId: m.userId._id.toString(),
        username: m.userId.username,
        email: m.userId.email || "",
        avatarUrl: m.userId.avatarUrl || "",
        role: m.role,
        createdAt: m.createdAt,
      }));

    return NextResponse.json({
      owner: ownerUser
        ? {
            userId: ownerUser._id.toString(),
            username: ownerUser.username,
            email: ownerUser.email || "",
            avatarUrl: ownerUser.avatarUrl || "",
            role: "owner",
          }
        : null,
      members: formattedMembers,
      currentUserRole: role,
    });
  } catch (error) {
    console.error("Projects Members GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve project members",
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

    const rawBody = await request.json();
    const parsed = addMemberSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid payload",
          },
        },
        { status: 400 },
      );
    }

    const { projectId, usernameOrEmail, role } = parsed.data;

    // Check project admin permission
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "admin",
    );

    if (!authorized || !project) {
      return NextResponse.json(
        { error: error || { code: "FORBIDDEN", message: "Only project admins can add members" } },
        { status: error?.status || 403 },
      );
    }

    await connectToDatabase();

    const normalizedQuery = usernameOrEmail.trim().toLowerCase();
    const targetUser = await User.findOne({
      $or: [{ username: normalizedQuery }, { email: normalizedQuery }],
    });

    if (!targetUser) {
      return NextResponse.json(
        {
          error: {
            code: "USER_NOT_FOUND",
            message: `User "${usernameOrEmail}" does not exist. Please ensure they have registered an account first.`,
          },
        },
        { status: 404 },
      );
    }

    // Check if target user is already the owner
    if (targetUser._id.toString() === project.ownerId.toString()) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "User is already the owner of this project",
          },
        },
        { status: 409 },
      );
    }

    // Check if membership already exists
    const existingMembership = await Membership.findOne({
      projectId,
      userId: targetUser._id,
    });

    if (existingMembership) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "User is already a member of this project",
          },
        },
        { status: 409 },
      );
    }

    const membership = await Membership.create({
      projectId,
      userId: targetUser._id,
      role,
    });

    await logAuditEvent({
      projectId,
      userId: user._id.toString(),
      action: "member.invite",
      targetEntity: "membership",
      targetId: targetUser._id.toString(),
      metadata: {
        username: targetUser.username,
        email: targetUser.email,
        role,
      },
    });

    return NextResponse.json(
      {
        success: true,
        member: {
          id: membership._id.toString(),
          userId: targetUser._id.toString(),
          username: targetUser.username,
          email: targetUser.email || "",
          role: membership.role,
          createdAt: membership.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Projects Members POST Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add member to project",
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

    const rawBody = await request.json();
    const parsed = updateMemberSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid payload",
          },
        },
        { status: 400 },
      );
    }

    const { projectId, membershipId, role } = parsed.data;

    // Check project admin permission
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      projectId,
      "admin",
    );

    if (!authorized || !project) {
      return NextResponse.json(
        { error: error || { code: "FORBIDDEN", message: "Only project admins can update member roles" } },
        { status: error?.status || 403 },
      );
    }

    await connectToDatabase();

    const membership = await Membership.findOne({ _id: membershipId, projectId });
    if (!membership) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Membership record not found" } },
        { status: 404 },
      );
    }

    const oldRole = membership.role;
    membership.role = role;
    await membership.save();

    await logAuditEvent({
      projectId,
      userId: user._id.toString(),
      action: "member.role_update",
      targetEntity: "membership",
      targetId: membership.userId.toString(),
      metadata: {
        oldRole,
        newRole: role,
      },
    });

    return NextResponse.json({
      success: true,
      member: {
        id: membership._id.toString(),
        userId: membership.userId.toString(),
        role: membership.role,
      },
    });
  } catch (error) {
    console.error("Projects Members PATCH Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update member role",
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

    const rawBody = await request.json();
    const parsed = deleteMemberSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: parsed.error.errors[0]?.message || "Invalid payload",
          },
        },
        { status: 400 },
      );
    }

    const { projectId, membershipId } = parsed.data;

    await connectToDatabase();

    const membership = await Membership.findOne({ _id: membershipId, projectId });
    if (!membership) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Membership record not found" } },
        { status: 404 },
      );
    }

    // Allow user to leave project, or require admin to remove others
    const isSelfLeaving = membership.userId.toString() === user._id.toString();
    if (!isSelfLeaving) {
      const { authorized, error } = await requireProjectPermission(
        user._id,
        projectId,
        "admin",
      );

      if (!authorized) {
        return NextResponse.json(
          { error: error || { code: "FORBIDDEN", message: "Only project admins can remove other members" } },
          { status: error?.status || 403 },
        );
      }
    }

    await Membership.deleteOne({ _id: membershipId });

    await logAuditEvent({
      projectId,
      userId: user._id.toString(),
      action: "member.remove",
      targetEntity: "membership",
      targetId: membership.userId.toString(),
      metadata: {
        removedUserId: membership.userId.toString(),
        isSelfLeaving,
      },
    });

    return NextResponse.json({
      success: true,
      message: isSelfLeaving
        ? "Successfully left the project"
        : "Member removed from project",
    });
  } catch (error) {
    console.error("Projects Members DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove member from project",
        },
      },
      { status: 500 },
    );
  }
}
