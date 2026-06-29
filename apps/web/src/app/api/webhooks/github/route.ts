import { NextResponse } from "next/server";
import { connectToDatabase, Project, Service, Deploy } from "@repo/db";
import { z } from "zod";
import { delCache } from "@/lib/redis";
import { hashApiKey } from "@/lib/crypto";

const deployPayloadSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["prod", "staging", "dev"]),
  commitSha: z.string().min(1, "Commit SHA is required"),
  commitMessage: z.string().min(1, "Commit message is required"),
  branch: z.string().min(1, "Branch name is required"),
  metadata: z.record(z.any()).optional(),
});

export async function POST(request: Request) {
  try {
    // 1. Authenticate Request
    const apiKey = request.headers.get("x-api-key");
    if (!apiKey) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Missing x-api-key header",
          },
        },
        { status: 401 },
      );
    }

    // 2. Connect to Database
    await connectToDatabase();

    // 3. Find Project (Tenant Isolation)
    const hashedApiKey = hashApiKey(apiKey);
    const project = await Project.findOne({
      $or: [{ apiKey: apiKey }, { apiKey: hashedApiKey }],
    });
    if (!project) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        },
        { status: 401 },
      );
    }

    // 4. Parse & Validate Payload
    const rawBody = await request.json();
    const validatedData = deployPayloadSchema.parse(rawBody);

    // 5. Find or Create Service
    let service = await Service.findOne({
      projectId: project._id,
      name: validatedData.service,
      environment: validatedData.environment,
    });

    if (!service) {
      service = await Service.create({
        projectId: project._id,
        name: validatedData.service,
        environment: validatedData.environment,
      });
    }

    // 6. Create Deploy Record
    const deploy = await Deploy.create({
      projectId: project._id,
      serviceId: service._id,
      commitSha: validatedData.commitSha,
      commitMessage: validatedData.commitMessage,
      branch: validatedData.branch,
      environment: validatedData.environment,
      deployedAt: new Date(),
      metadata: validatedData.metadata || {},
    });

    // Invalidate dashboard cache
    await delCache(`dashboard:project:${project._id.toString()}`);

    return NextResponse.json({
      success: true,
      deployId: deploy._id.toString(),
      message: "Deployment logged successfully",
    });
  } catch (error) {
    console.error("Deploy Webhook Error:", error);

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
          message:
            error instanceof Error ? error.message : "Internal server error",
        },
      },
      { status: 500 },
    );
  }
}
