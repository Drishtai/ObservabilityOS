import { getAuthenticatedUser } from "@/lib/auth";
import { connectToDatabase, Project, Membership } from "@repo/db";
import { createNewRedisClient } from "@/lib/redis";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { error: "Missing projectId parameter" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has access (owner or member)
    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const isOwner = project.ownerId.toString() === user._id.toString();
    const isMember = await Membership.findOne({ projectId, userId: user._id });

    if (!isOwner && !isMember) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Set headers for Server-Sent Events (SSE)
    const headers = new Headers({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const redisSub = createNewRedisClient();
    if (!redisSub) {
      return NextResponse.json(
        { error: "Redis connection failed" },
        { status: 500 },
      );
    }

    const channel = `project:${projectId}:logs`;

    const stream = new ReadableStream({
      async start(controller) {
        // Send initial connection event
        controller.enqueue(
          `data: ${JSON.stringify({ event: "connected" })}\n\n`,
        );

        // Subscribe to Redis channel
        await redisSub.subscribe(channel);

        // Handle incoming messages
        redisSub.on("message", (chan, message) => {
          if (chan === channel) {
            controller.enqueue(`data: ${message}\n\n`);
          }
        });

        // Keep-alive heartbeat every 15 seconds to prevent timeout
        const keepAliveInterval = setInterval(() => {
          try {
            controller.enqueue(
              `data: ${JSON.stringify({ event: "heartbeat" })}\n\n`,
            );
          } catch {
            clearInterval(keepAliveInterval);
          }
        }, 15000);

        // Clean up when client disconnects
        request.signal.addEventListener("abort", async () => {
          clearInterval(keepAliveInterval);
          try {
            await redisSub.unsubscribe(channel);
            await redisSub.quit();
          } catch (err) {
            console.error("Error cleaning up Redis subscription:", err);
          }
          controller.close();
        });
      },
      cancel() {
        try {
          redisSub.unsubscribe(channel);
          redisSub.quit();
        } catch (err) {
          console.error("Error in cancel cleanup:", err);
        }
      },
    });

    return new Response(stream, { headers });
  } catch (err) {
    console.error("SSE stream error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
