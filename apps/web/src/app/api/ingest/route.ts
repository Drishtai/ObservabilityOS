import { NextResponse } from "next/server";
import { connectToDatabase, Project, Service, Log } from "@repo/db";
import { z } from "zod";
import { Types } from "mongoose";
import { triggerAnomalyCheck } from "@/lib/anomaly";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashApiKey } from "@/lib/crypto";
import { scrubText, scrubObject } from "@/lib/scrubber";
import { getRedisClient } from "@/lib/redis";
import {
  PLAN_LIMITS,
  getLogVolumeUsage,
  incrementLogVolumeUsage,
} from "@/lib/quota";

// Validation schema for single log items
const logItemSchema = z.object({
  service: z.string().min(1, "Service name is required"),
  environment: z.enum(["prod", "staging", "dev"]),
  timestamp: z.string().datetime().optional(), // Must be ISO datetime format if provided
  level: z.enum(["error", "warn", "info", "debug"]),
  message: z.string().min(1, "Message is required"),
  metadata: z.record(z.any()).optional(),
  traceId: z.string().optional(),
});

// Payload can be a single log or an array of logs
const ingestPayloadSchema = z.union([logItemSchema, z.array(logItemSchema)]);

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

    // 4. Parse & Validate Payload and Track Volume Limits
    const rawBodyText = await request.text();
    const bytesToAdd = Buffer.byteLength(rawBodyText, "utf-8");
    const rawBody = JSON.parse(rawBodyText);
    const validatedData = ingestPayloadSchema.parse(rawBody);

    // Standardize to an array of log items
    const logItems = Array.isArray(validatedData)
      ? validatedData
      : [validatedData];

    if (logItems.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const plan = project.plan || "free";
    const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free;

    const currentVolume = await getLogVolumeUsage(project._id.toString());
    if (currentVolume + bytesToAdd > limits.maxLogVolumeBytes) {
      return NextResponse.json(
        {
          error: {
            code: "QUOTA_EXCEEDED",
            message: `Monthly log ingestion limit exceeded. Your plan (${plan}) only allows up to ${limits.maxLogVolumeBytes / (1024 * 1024)}MB of logs per month.`,
          },
        },
        { status: 403 },
      );
    }

    // 5. Cache/Fetch Services
    const existingServices = await Service.find({ projectId: project._id });
    const serviceMap = new Map<string, Types.ObjectId>();
    for (const s of existingServices) {
      serviceMap.set(`${s.name}-${s.environment}`, s._id);
    }

    // Determine how many new services need to be created in this batch
    const servicesToCreate = new Set<string>();
    for (const logItem of logItems) {
      const cacheKey = `${logItem.service}-${logItem.environment}`;
      if (!serviceMap.has(cacheKey)) {
        const dbService = await Service.findOne({
          projectId: project._id,
          name: logItem.service,
          environment: logItem.environment,
        });
        if (!dbService) {
          servicesToCreate.add(cacheKey);
        } else {
          serviceMap.set(cacheKey, dbService._id);
        }
      }
    }

    if (servicesToCreate.size > 0) {
      const currentServiceCount = await Service.countDocuments({
        projectId: project._id,
      });
      if (currentServiceCount + servicesToCreate.size > limits.maxServices) {
        return NextResponse.json(
          {
            error: {
              code: "QUOTA_EXCEEDED",
              message: `Service limit reached. Your plan (${plan}) only allows up to ${limits.maxServices} services.`,
            },
          },
          { status: 403 },
        );
      }
    }

    // Ensure all services mentioned in the logs exist
    for (const logItem of logItems) {
      const cacheKey = `${logItem.service}-${logItem.environment}`;
      if (!serviceMap.has(cacheKey)) {
        let s = await Service.findOne({
          projectId: project._id,
          name: logItem.service,
          environment: logItem.environment,
        });

        if (!s) {
          try {
            s = await Service.create({
              projectId: project._id,
              name: logItem.service,
              environment: logItem.environment,
            });
          } catch {
            // In case of concurrent request race conditions, retrieve the created service
            s = await Service.findOne({
              projectId: project._id,
              name: logItem.service,
              environment: logItem.environment,
            });
            if (!s) {
              throw new Error(`Failed to resolve service ${logItem.service}`);
            }
          }
        }
        serviceMap.set(cacheKey, s._id);
      }
    }

    // 6. Map Logs & Bulk Insert
    const logsToInsert = logItems.map((logItem) => {
      const serviceId = serviceMap.get(
        `${logItem.service}-${logItem.environment}`,
      );
      return {
        projectId: project._id,
        serviceId,
        timestamp: logItem.timestamp ? new Date(logItem.timestamp) : new Date(),
        level: logItem.level,
        message: scrubText(logItem.message),
        metadata: logItem.metadata ? scrubObject(logItem.metadata) : {},
        traceId: logItem.traceId,
        environment: logItem.environment,
      };
    });

    await Log.insertMany(logsToInsert);

    // Track log volume usage
    await incrementLogVolumeUsage(project._id.toString(), bytesToAdd);

    // Publish to Redis Pub/Sub for real-time streaming
    const redisClient = getRedisClient();
    if (redisClient) {
      logItems.forEach((logItem, index) => {
        const log = logsToInsert[index];
        const channel = `project:${project._id.toString()}:logs`;
        const publishPayload = {
          id:
            (log as { _id?: { toString(): string } })._id?.toString() ||
            Math.random().toString(),
          timestamp: log.timestamp.toISOString(),
          level: log.level,
          message: log.message,
          traceId: log.traceId || null,
          metadata: log.metadata || {},
          service: {
            id: log.serviceId?.toString() || "",
            name: logItem.service,
            environment: log.environment,
          },
        };
        redisClient
          .publish(channel, JSON.stringify(publishPayload))
          .catch((err) => {
            console.warn(
              `Failed to publish log to Redis channel ${channel}:`,
              err,
            );
          });
      });
    }

    // Trigger Anomaly Detection asynchronously for each unique service+environment in the batch
    const uniqueServiceEnvs = new Map<
      string,
      { serviceId: Types.ObjectId; environment: "prod" | "staging" | "dev" }
    >();
    for (const logItem of logsToInsert) {
      if (logItem.serviceId) {
        const key = `${logItem.serviceId.toString()}-${logItem.environment}`;
        uniqueServiceEnvs.set(key, {
          serviceId: logItem.serviceId as Types.ObjectId,
          environment: logItem.environment as "prod" | "staging" | "dev",
        });
      }
    }

    for (const { serviceId, environment } of uniqueServiceEnvs.values()) {
      triggerAnomalyCheck(
        project._id.toString(),
        serviceId.toString(),
        environment,
      ).catch((err) => {
        console.error(
          `[Ingest Route] Failed to trigger anomaly check for service ${serviceId}:`,
          err,
        );
      });
    }

    return NextResponse.json({
      success: true,
      count: logsToInsert.length,
    });
  } catch (error) {
    console.error("Ingestion API Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Validation failed",
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
