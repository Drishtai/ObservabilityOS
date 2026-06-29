import { NextResponse } from "next/server";
import { connectToDatabase, Project, Service, Metric } from "@repo/db";
import { z } from "zod";
import { Types } from "mongoose";
import { delCache } from "@/lib/redis";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashApiKey } from "@/lib/crypto";
import { triggerAnomalyCheck } from "@/lib/anomaly";

// Validation schema for single metric item
const metricItemSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["prod", "staging", "dev"]),
  timestamp: z.string().datetime().optional(),
  cpuUsage: z
    .number()
    .min(0, "CPU usage must be at least 0")
    .max(100, "CPU usage cannot exceed 100"),
  memoryUsage: z.number().min(0, "Memory usage must be at least 0"),
  memoryLimit: z.number().min(0, "Memory limit must be at least 0"),
  latencyMs: z.number().min(0, "Latency must be at least 0"),
});

// Payload can be a single metric item or an array of items
const ingestPayloadSchema = z.union([
  metricItemSchema,
  z.array(metricItemSchema),
]);

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

    // Rate Limiting per API key (default: 100 requests per 60 seconds)
    const limit = process.env.RATE_LIMIT_MAX_REQUESTS
      ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10)
      : 100;
    const windowMs = process.env.RATE_LIMIT_WINDOW_MS
      ? parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10)
      : 60000;

    const rateLimit = await checkRateLimit(apiKey, limit, windowMs);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: {
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded. Maximum ${limit} requests per ${windowMs / 1000} seconds.`,
          },
        },
        { status: 429 },
      );
    }

    // 4. Parse & Validate Payload
    const rawBody = await request.json();
    const validatedData = ingestPayloadSchema.parse(rawBody);

    // Standardize to an array
    const metricItems = Array.isArray(validatedData)
      ? validatedData
      : [validatedData];

    if (metricItems.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    // 5. Cache/Fetch Services
    const existingServices = await Service.find({ projectId: project._id });
    const serviceMap = new Map<string, Types.ObjectId>();
    for (const s of existingServices) {
      serviceMap.set(`${s.name}-${s.environment}`, s._id);
    }

    // Ensure all services mentioned in the metrics exist
    for (const item of metricItems) {
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
            // Retrieve in case of concurrent creation race condition
            s = await Service.findOne({
              projectId: project._id,
              name: item.service,
              environment: item.environment,
            });
            if (!s) {
              throw new Error(`Failed to resolve service ${item.service}`);
            }
          }
        }
        serviceMap.set(cacheKey, s._id);
      }
    }

    // 6. Map Metrics & Bulk Insert
    const metricsToInsert = metricItems.map((item) => {
      const serviceId = serviceMap.get(`${item.service}-${item.environment}`);
      return {
        projectId: project._id,
        serviceId,
        timestamp: item.timestamp ? new Date(item.timestamp) : new Date(),
        environment: item.environment,
        cpuUsage: item.cpuUsage,
        memoryUsage: item.memoryUsage,
        memoryLimit: item.memoryLimit,
        latencyMs: item.latencyMs,
      };
    });

    await Metric.insertMany(metricsToInsert);

    // Invalidate cached query keys for affected services
    const uniqueServiceIds = new Set<string>();
    for (const m of metricsToInsert) {
      if (m.serviceId) {
        uniqueServiceIds.add(m.serviceId.toString());
      }
    }

    const projectIdStr = project._id.toString();
    for (const serviceIdStr of uniqueServiceIds) {
      await delCache(`metrics:query:${projectIdStr}:${serviceIdStr}:1h`);
      await delCache(`metrics:query:${projectIdStr}:${serviceIdStr}:24h`);
      await delCache(`metrics:query:${projectIdStr}:${serviceIdStr}:7d`);
    }

    // Trigger Anomaly Detection asynchronously for each unique service+environment in the metrics batch
    const uniqueServiceEnvs = new Map<
      string,
      { serviceId: Types.ObjectId; environment: "prod" | "staging" | "dev" }
    >();
    for (const item of metricsToInsert) {
      if (item.serviceId) {
        const key = `${item.serviceId.toString()}-${item.environment}`;
        uniqueServiceEnvs.set(key, {
          serviceId: item.serviceId as Types.ObjectId,
          environment: item.environment as "prod" | "staging" | "dev",
        });
      }
    }

    for (const { serviceId, environment } of uniqueServiceEnvs.values()) {
      triggerAnomalyCheck(
        projectIdStr,
        serviceId.toString(),
        environment,
      ).catch((err) => {
        console.error(
          `[Metrics Ingest Route] Failed to trigger anomaly check for service ${serviceId}:`,
          err,
        );
      });
    }

    return NextResponse.json({
      success: true,
      count: metricsToInsert.length,
    });
  } catch (error) {
    console.error("Metrics Ingestion API Error:", error);

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
