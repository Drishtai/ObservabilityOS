import { NextResponse } from "next/server";
import { connectToDatabase, Project, Service, Span } from "@repo/db";
import { z } from "zod";
import { Types } from "mongoose";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashApiKey } from "@/lib/crypto";
import { scrubObject } from "@/lib/scrubber";

const spanEventSchema = z.object({
  name: z.string().min(1),
  timestamp: z.string().datetime().optional(),
  attributes: z.record(z.any()).optional(),
});

const spanItemSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["prod", "staging", "dev"]).default("dev"),
  traceId: z.string().min(1, "traceId is required"),
  spanId: z.string().min(1, "spanId is required"),
  parentSpanId: z.string().optional(),
  name: z.string().min(1, "Span name is required"),
  kind: z
    .enum(["server", "client", "internal", "producer", "consumer"])
    .optional()
    .default("internal"),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  durationMs: z.number().min(0).optional(),
  status: z.enum(["ok", "error", "unset"]).optional().default("ok"),
  statusCode: z.number().optional(),
  errorMessage: z.string().optional(),
  attributes: z.record(z.any()).optional(),
  events: z.array(spanEventSchema).optional(),
});

const ingestPayloadSchema = z.union([spanItemSchema, z.array(spanItemSchema)]);

export async function POST(request: Request) {
  try {
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

    await connectToDatabase();

    const hashedApiKey = hashApiKey(apiKey);
    const project = await Project.findOne({ apiKey: hashedApiKey });
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

    const rateLimit = await checkRateLimit(apiKey, 200, 60000);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "TOO_MANY_REQUESTS",
            message: "Rate limit exceeded",
          },
        },
        { status: 429 },
      );
    }

    const rawBody = await request.json();
    const validatedData = ingestPayloadSchema.parse(rawBody);
    const spanItems = Array.isArray(validatedData)
      ? validatedData
      : [validatedData];

    if (spanItems.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // Resolve or auto-create services
    const existingServices = await Service.find({ projectId: project._id });
    const serviceMap = new Map<string, Types.ObjectId>();
    for (const s of existingServices) {
      serviceMap.set(`${s.name}-${s.environment}`, s._id);
    }

    for (const item of spanItems) {
      const cacheKey = `${item.service}-${item.environment}`;
      if (!serviceMap.has(cacheKey)) {
        let s = await Service.findOne({
          projectId: project._id,
          name: item.service,
          environment: item.environment,
        });
        if (!s) {
          try {
            s = await Service.create({
              projectId: project._id,
              name: item.service,
              environment: item.environment,
            });
          } catch {
            s = await Service.findOne({
              projectId: project._id,
              name: item.service,
              environment: item.environment,
            });
            if (!s)
              throw new Error(`Failed to resolve service ${item.service}`);
          }
        }
        serviceMap.set(cacheKey, s._id);
      }
    }

    const spansToInsert = spanItems.map((item) => {
      const serviceId = serviceMap.get(`${item.service}-${item.environment}`);
      const start = new Date(item.startTime);
      const end = new Date(item.endTime);
      const computedDuration = Math.max(
        0,
        item.durationMs ?? end.getTime() - start.getTime(),
      );

      return {
        projectId: project._id,
        serviceId,
        traceId: item.traceId,
        spanId: item.spanId,
        parentSpanId: item.parentSpanId || undefined,
        name: item.name,
        kind: item.kind,
        startTime: start,
        endTime: end,
        durationMs: computedDuration,
        status: item.status,
        statusCode: item.statusCode,
        errorMessage: item.errorMessage,
        attributes: item.attributes
          ? (scrubObject(item.attributes) as Record<string, unknown>)
          : {},
        events: item.events?.map((e) => ({
          name: e.name,
          timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
          attributes: e.attributes
            ? (scrubObject(e.attributes) as Record<string, unknown>)
            : {},
        })),
        environment: item.environment,
      };
    });

    await Span.insertMany(spansToInsert);

    return NextResponse.json({
      success: true,
      count: spansToInsert.length,
    });
  } catch (error) {
    console.error("[Traces Ingest API Error]:", error);
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

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key, Authorization",
    },
  });
}
