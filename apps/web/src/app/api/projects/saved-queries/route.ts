import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectPermission } from "@/lib/permissions";

const savedQuerySchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  query: z.string().optional().default(""),
  level: z.string().optional().default("all"),
  serviceId: z.string().optional().default("all"),
  environment: z.string().optional().default("all"),
  timeRange: z.string().optional().default("24h"),
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
    const validated = savedQuerySchema.parse(rawBody);

    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      validated.projectId,
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

    if (!project.savedQueries) {
      project.savedQueries = [];
    }

    // Check if a saved query with the same name already exists
    const exists = project.savedQueries.some(
      (q) => q.name.toLowerCase() === validated.name.trim().toLowerCase(),
    );
    if (exists) {
      return NextResponse.json(
        {
          error: {
            code: "CONFLICT",
            message: "A saved query with this name already exists",
          },
        },
        { status: 409 },
      );
    }

    project.savedQueries.push({
      name: validated.name.trim(),
      query: validated.query,
      level: validated.level,
      serviceId: validated.serviceId,
      environment: validated.environment,
      timeRange: validated.timeRange,
    });

    await project.save();

    return NextResponse.json({
      success: true,
      savedQueries: project.savedQueries,
    });
  } catch (error) {
    console.error("Saved Queries POST Error:", error);
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
          message: "Failed to save query",
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
    const queryName = searchParams.get("queryName");

    if (!projectId || !queryName) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "projectId and queryName are required",
          },
        },
        { status: 400 },
      );
    }

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

    if (!project.savedQueries || project.savedQueries.length === 0) {
      return NextResponse.json({ success: true, savedQueries: [] });
    }

    project.savedQueries = project.savedQueries.filter(
      (q) => q.name.toLowerCase() !== queryName.toLowerCase(),
    );

    await project.save();

    return NextResponse.json({
      success: true,
      savedQueries: project.savedQueries,
    });
  } catch (error) {
    console.error("Saved Queries DELETE Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete saved query",
        },
      },
      { status: 500 },
    );
  }
}
