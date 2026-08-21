import { Types } from "mongoose";
import { connectToDatabase, Project, Membership, IProject } from "@repo/db";

export type ProjectRole = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<ProjectRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export interface MembershipResult {
  isMember: boolean;
  role: ProjectRole | null;
  project: IProject | null;
}

export interface PermissionCheckResult {
  authorized: boolean;
  role: ProjectRole | null;
  project: IProject | null;
  error?: {
    code: "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST";
    message: string;
    status: number;
  };
}

/**
 * Resolves whether a user has access to a project and returns their effective role.
 * An owner always has the highest role ("owner").
 */
export async function getProjectMembership(
  userId: string | Types.ObjectId,
  projectId: string | Types.ObjectId
): Promise<MembershipResult> {
  await connectToDatabase();

  const userObjId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;
  const projectObjId = typeof projectId === "string" ? new Types.ObjectId(projectId) : projectId;

  const project = await Project.findById(projectObjId);
  if (!project) {
    return { isMember: false, role: null, project: null };
  }

  // Check if owner
  if (project.ownerId.toString() === userObjId.toString()) {
    return { isMember: true, role: "owner", project };
  }

  // Check Membership table
  const membership = await Membership.findOne({
    projectId: projectObjId,
    userId: userObjId,
  });

  if (!membership) {
    return { isMember: false, role: null, project: null };
  }

  return {
    isMember: true,
    role: membership.role as ProjectRole,
    project,
  };
}

/**
 * Checks if a user has at least the specified minimum role in a project.
 */
export async function requireProjectPermission(
  userId: string | Types.ObjectId,
  projectId: string | Types.ObjectId,
  minimumRole: ProjectRole = "viewer"
): Promise<PermissionCheckResult> {
  if (!projectId) {
    return {
      authorized: false,
      role: null,
      project: null,
      error: {
        code: "BAD_REQUEST",
        message: "projectId is required",
        status: 400,
      },
    };
  }

  try {
    const { isMember, role, project } = await getProjectMembership(userId, projectId);

    if (!isMember || !role || !project) {
      return {
        authorized: false,
        role: null,
        project: null,
        error: {
          code: "NOT_FOUND",
          message: "Project not found or access denied",
          status: 404,
        },
      };
    }

    const userRank = ROLE_RANK[role] || 0;
    const requiredRank = ROLE_RANK[minimumRole] || 1;

    if (userRank < requiredRank) {
      return {
        authorized: false,
        role,
        project,
        error: {
          code: "FORBIDDEN",
          message: `Insufficient permissions. Requires '${minimumRole}' role or higher.`,
          status: 403,
        },
      };
    }

    return {
      authorized: true,
      role,
      project,
    };
  } catch (error) {
    console.error("requireProjectPermission Error:", error);
    return {
      authorized: false,
      role: null,
      project: null,
      error: {
        code: "NOT_FOUND",
        message: "Invalid project ID or access denied",
        status: 404,
      },
    };
  }
}

/**
 * Retrieves all project IDs accessible by the user (either owned or as a member).
 */
export async function getUserAccessibleProjectIds(
  userId: string | Types.ObjectId
): Promise<Types.ObjectId[]> {
  await connectToDatabase();
  const userObjId = typeof userId === "string" ? new Types.ObjectId(userId) : userId;

  const [ownedProjects, memberships] = await Promise.all([
    Project.find({ ownerId: userObjId }, { _id: 1 }),
    Membership.find({ userId: userObjId }, { projectId: 1 }),
  ]);

  const ids = new Set<string>();
  ownedProjects.forEach((p) => ids.add(p._id.toString()));
  memberships.forEach((m) => ids.add(m.projectId.toString()));

  return Array.from(ids).map((id) => new Types.ObjectId(id));
}
