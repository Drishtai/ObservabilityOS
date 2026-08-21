import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Incident, Project, Comment } from "@repo/db";
import { generateEmbedding } from "@repo/ai";
import { delCache } from "@/lib/redis";
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

    // Tenant Check: Ensure user has at least viewer access
    const { authorized, project, error } = await requireProjectPermission(
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

    const incidents = await Incident.find({ projectId })
      .populate("serviceId")
      .populate("deployId")
      .sort({ createdAt: -1 });

    return NextResponse.json({ incidents });
  } catch (error) {
    console.error("Incidents GET Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to retrieve incidents",
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

    const { incidentId, status } = await request.json();
    if (
      !incidentId ||
      !status ||
      !["open", "investigating", "resolved"].includes(status)
    ) {
      return NextResponse.json(
        {
          error: { code: "BAD_REQUEST", message: "Invalid payload parameters" },
        },
        { status: 400 },
      );
    }

    // Find Incident
    const incident = await Incident.findById(incidentId);
    if (!incident) {
      return NextResponse.json(
        { error: { code: "NOT_FOUND", message: "Incident not found" } },
        { status: 404 },
      );
    }

    // Tenant Check: Ensure user has member access to this project
    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      incident.projectId,
      "member",
    );
    if (!authorized || !project) {
      return NextResponse.json(
        { error: error || { code: "FORBIDDEN", message: "Forbidden: Access denied" } },
        { status: error?.status || 403 },
      );
    }

    // Update status
    const previousStatus = incident.status;
    incident.status = status;

    if (status === "resolved" && previousStatus !== "resolved") {
      incident.resolvedAt = new Date();
      incident.ttr =
        incident.resolvedAt.getTime() - incident.createdAt.getTime();

      try {
        // Gather comments for additional context
        const incidentComments = await Comment.find({
          incidentId: incident._id,
        });
        const commentsText = incidentComments.map((c) => c.content).join("\n");

        // Aggregate text to embed
        const textToEmbed =
          `Title: ${incident.title}\n` +
          `Summary: ${incident.summary}\n` +
          `Root Cause: ${incident.rootCause}\n` +
          `Suggested Fixes: ${incident.suggestedFix.join("\n")}\n` +
          (commentsText ? `Developer Comments:\n${commentsText}` : "");

        incident.embeddings = await generateEmbedding(textToEmbed);
      } catch (embErr) {
        console.error(
          "[Incidents API] Failed to generate incident embedding:",
          embErr,
        );
      }
    } else if (status !== "resolved" && previousStatus === "resolved") {
      incident.resolvedAt = undefined;
      incident.ttr = undefined;
      incident.embeddings = undefined;
    }

    await incident.save();

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${incident.projectId.toString()}`);

    // Populate service and deploy to return full object
    const updatedIncident = await Incident.findById(incidentId)
      .populate("serviceId")
      .populate("deployId");

    return NextResponse.json({ incident: updatedIncident });
  } catch (error) {
    console.error("Incidents PATCH Error:", error);
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update incident",
        },
      },
      { status: 500 },
    );
  }
}
