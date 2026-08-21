import {
  connectToDatabase,
  Log,
  Service,
  Deploy,
  Incident,
  Project,
  Metric,
  Comment,
} from "@repo/db";
import {
  generateIncidentAnalysis,
  generateEmbedding,
  LogContext,
  DeployContext,
  HistoricalIncident,
} from "@repo/ai";
import { Types } from "mongoose";
import { dispatchMultiChannelIncidentAlert } from "./alerts";
import { delCache } from "./redis";

import type { Queue, IRedisClient } from "bullmq";

// Setup queue and worker dependencies dynamically to avoid crash if ioredis fails to connect.
let queue: Queue | null = null;

const REDIS_URL = process.env.REDIS_URL;

async function initQueue() {
  if (REDIS_URL && !queue) {
    try {
      const { Queue, Worker } = await import("bullmq");
      const { default: IORedis } = await import("ioredis");

      let connection;
      try {
        const parsed = new URL(REDIS_URL);
        const options = {
          host: parsed.hostname,
          port: parsed.port ? parseInt(parsed.port, 10) : 6379,
          username: parsed.username || undefined,
          password: parsed.password || undefined,
          db:
            parsed.pathname && parsed.pathname !== "/"
              ? parseInt(parsed.pathname.substring(1), 10)
              : 0,
          maxRetriesPerRequest: null,
        };
        connection = new IORedis(options);
      } catch {
        connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });
      }
      queue = new Queue("anomaly-detection-queue", {
        connection: connection as unknown as IRedisClient,
      });

      new Worker(
        "anomaly-detection-queue",
        async (job) => {
          const { projectId, serviceId, environment } = job.data;
          try {
            await processAnomalyDetection(projectId, serviceId, environment);
          } catch (err) {
            console.error(`[Anomaly Worker] Job ${job.id} failed:`, err);
            throw err;
          }
        },
        { connection: connection as unknown as IRedisClient },
      );
      console.log(
        "[Anomaly Queue] BullMQ Queue and Worker initialized successfully.",
      );
    } catch (err) {
      console.error("[Anomaly Queue] Failed to initialize BullMQ worker:", err);
    }
  }
}

// Proactively run initialization
initQueue().catch((err) => console.error("Failed to initialize queue:", err));

/**
 * Triggers anomaly check asynchronously, offloading to BullMQ if Redis is configured
 * or running directly in the background if not.
 */
export async function triggerAnomalyCheck(
  projectId: string,
  serviceId: string,
  environment: string,
): Promise<void> {
  await initQueue();
  if (queue) {
    try {
      await queue.add("check-anomaly", { projectId, serviceId, environment });
      console.log(
        `[Anomaly Queue] Enqueued anomaly check job for service ${serviceId}`,
      );
      return;
    } catch (err) {
      console.warn(
        "[Anomaly Queue] Failed to add job to queue, falling back to inline background run...",
        err,
      );
    }
  }

  // Fallback: run in background promise without awaiting
  processAnomalyDetection(projectId, serviceId, environment).catch((err) => {
    console.error(
      "[Anomaly Detection Fallback] Background execution failed:",
      err,
    );
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let mA = 0;
  let mB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i] ?? 0;
    const valB = b[i] ?? 0;
    dotProduct += valA * valB;
    mA += valA * valA;
    mB += valB * valB;
  }
  return mA === 0 || mB === 0
    ? 0
    : dotProduct / (Math.sqrt(mA) * Math.sqrt(mB));
}

/**
 * Performs a vector search (or keyword/recency fallback) to retrieve similar past resolved incidents
 * for RAG augmentation of the incident analysis.
 */
export async function retrieveSimilarIncidents(
  projectId: string,
  currentLogsText: string,
  limit = 3,
): Promise<HistoricalIncident[]> {
  try {
    const queryEmbedding = await generateEmbedding(currentLogsText);

    // Fetch up to 50 resolved incidents from the project that have embeddings populated
    const pastIncidents = await Incident.find({
      projectId: new Types.ObjectId(projectId),
      status: "resolved",
      embeddings: { $exists: true, $not: { $size: 0 } },
    })
      .sort({ createdAt: -1 })
      .limit(50);

    if (pastIncidents.length === 0) {
      // Fallback: If no embeddings exist in the DB yet, return the 3 most recent resolved incidents
      const fallbackIncidents = await Incident.find({
        projectId: new Types.ObjectId(projectId),
        status: "resolved",
      })
        .sort({ createdAt: -1 })
        .limit(limit);

      const results: HistoricalIncident[] = [];
      for (const inc of fallbackIncidents) {
        const comments = await Comment.find({ incidentId: inc._id });
        results.push({
          title: inc.title,
          rootCause: inc.rootCause,
          suggestedFix: inc.suggestedFix,
          comments: comments.map((c) => c.content),
        });
      }
      return results;
    }

    // Compute in-memory cosine similarity
    const scored = pastIncidents.map((inc) => {
      const score = inc.embeddings
        ? cosineSimilarity(queryEmbedding, inc.embeddings)
        : 0;
      return { incident: inc, score };
    });

    // Sort by similarity score descending
    scored.sort((a, b) => b.score - a.score);

    // Return the top N matching incidents
    const topMatches = scored.slice(0, limit).map((s) => s.incident);

    const results: HistoricalIncident[] = [];
    for (const inc of topMatches) {
      const comments = await Comment.find({ incidentId: inc._id });
      results.push({
        title: inc.title,
        rootCause: inc.rootCause,
        suggestedFix: inc.suggestedFix,
        comments: comments.map((c) => c.content),
      });
    }

    return results;
  } catch (err) {
    console.error("[Anomaly RAG] Failed to retrieve similar incidents:", err);
    return [];
  }
}

/**
 * Main execution logic for anomaly detection. Runs a Z-score statistical check
 * and triggers LLM reasoning and Slack alert dispatching if an anomaly is confirmed.
 */
export async function processAnomalyDetection(
  projectId: string,
  serviceId: string,
  environment: string,
): Promise<void> {
  await connectToDatabase();

  // Fetch Project to read custom alert configurations
  const projectDoc = await Project.findById(projectId);
  const minErrorCount = projectDoc?.minErrorCount ?? 3;
  const zScoreThreshold = projectDoc?.zScoreThreshold ?? 3.0;

  const now = new Date();
  const nowMs = now.getTime();
  const currentWindowStart = nowMs - 5 * 60 * 1000; // Last 5 minutes
  const sixtyFiveMinsAgo = nowMs - 65 * 60 * 1000; // 65 minutes ago

  // 1. Fetch error logs for this service in the last 65 minutes
  const errorLogs = await Log.find({
    projectId: new Types.ObjectId(projectId),
    serviceId: new Types.ObjectId(serviceId),
    environment,
    level: "error",
    timestamp: { $gte: new Date(sixtyFiveMinsAgo), $lte: now },
  }).select("timestamp message level metadata traceId");

  // Fetch metrics for this service in the last 65 minutes
  const metrics = await Metric.find({
    projectId: new Types.ObjectId(projectId),
    serviceId: new Types.ObjectId(serviceId),
    environment,
    timestamp: { $gte: new Date(sixtyFiveMinsAgo), $lte: now },
  });

  // Cooldown check: Is there already an incident created for this service in the last 5 minutes?
  const cooldownIncident = await Incident.findOne({
    serviceId: new Types.ObjectId(serviceId),
    createdAt: { $gte: new Date(nowMs - 5 * 60 * 1000) }, // last 5 minutes
  });

  if (cooldownIncident) {
    console.log(
      `[Anomaly Engine] Rate limit: Cooldown of 5 minutes active for service ${serviceId}. Skipping LLM incident analysis.`,
    );
    // If there is an active cooldown but it has an open/investigating incident, we can append current logs to it if they exist
    if (
      cooldownIncident.status === "open" ||
      cooldownIncident.status === "investigating"
    ) {
      const currentWindowLogs = errorLogs.filter(
        (l) => l.timestamp.getTime() >= currentWindowStart,
      );
      if (currentWindowLogs.length > 0) {
        const existingLogIds = cooldownIncident.relatedLogs.map((id) =>
          id.toString(),
        );
        const newLogIds = currentWindowLogs.map((l) => l._id.toString());
        const mergedLogIds = Array.from(
          new Set([...existingLogIds, ...newLogIds]),
        ).map((id) => new Types.ObjectId(id));

        cooldownIncident.relatedLogs = mergedLogIds;
        await cooldownIncident.save();
      }
    }
    return;
  }

  // 2. Count current window errors
  const currentErrorCount = errorLogs.filter(
    (l) => l.timestamp.getTime() >= currentWindowStart,
  ).length;

  let errorAnomaly = false;
  let errorZScore = 0;
  let errorMean = 0;

  if (currentErrorCount >= minErrorCount) {
    const historicalCounts: number[] = [];
    for (let i = 0; i < 12; i++) {
      const start = nowMs - (i + 2) * 5 * 60 * 1000;
      const end = nowMs - (i + 1) * 5 * 60 * 1000;
      const count = errorLogs.filter(
        (l) => l.timestamp.getTime() >= start && l.timestamp.getTime() < end,
      ).length;
      historicalCounts.push(count);
    }
    const sum = historicalCounts.reduce((a, b) => a + b, 0);
    errorMean = sum / historicalCounts.length;
    const variance =
      historicalCounts.reduce((a, b) => a + Math.pow(b - errorMean, 2), 0) /
      historicalCounts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) {
      if (currentErrorCount >= minErrorCount) {
        errorAnomaly = true;
        errorZScore = 5.0;
      }
    } else {
      errorZScore = (currentErrorCount - errorMean) / stdDev;
      if (errorZScore >= zScoreThreshold) {
        errorAnomaly = true;
      }
    }
  }

  // Helper function for metric Z-score calculation
  const calculateMetricZ = (key: "cpuUsage" | "latencyMs") => {
    const currentWindowMetrics = metrics.filter(
      (m) => m.timestamp.getTime() >= currentWindowStart,
    );

    if (currentWindowMetrics.length === 0) {
      return {
        zScore: 0,
        currentAvg: 0,
        historicalMean: 0,
        isAnomalous: false,
      };
    }

    const currentAvg =
      currentWindowMetrics.reduce((sum, m) => sum + (m[key] as number), 0) /
      currentWindowMetrics.length;

    const historicalAvgs: number[] = [];
    for (let i = 0; i < 12; i++) {
      const start = nowMs - (i + 2) * 5 * 60 * 1000;
      const end = nowMs - (i + 1) * 5 * 60 * 1000;
      const blockMetrics = metrics.filter(
        (m) => m.timestamp.getTime() >= start && m.timestamp.getTime() < end,
      );
      if (blockMetrics.length > 0) {
        const avg =
          blockMetrics.reduce((sum, m) => sum + (m[key] as number), 0) /
          blockMetrics.length;
        historicalAvgs.push(avg);
      } else {
        historicalAvgs.push(0);
      }
    }

    const sum = historicalAvgs.reduce((a, b) => a + b, 0);
    const mean = sum / historicalAvgs.length;
    const variance =
      historicalAvgs.reduce((a, b) => a + Math.pow(b - mean, 2), 0) /
      historicalAvgs.length;
    const stdDev = Math.sqrt(variance);

    let zScore = 0;
    let isAnomalous = false;

    if (stdDev === 0) {
      if (currentAvg > 0) {
        zScore = 5.0;
        isAnomalous = true;
      }
    } else {
      zScore = (currentAvg - mean) / stdDev;
      if (zScore >= zScoreThreshold) {
        isAnomalous = true;
      }
    }

    return { zScore, currentAvg, historicalMean: mean, isAnomalous };
  };

  const cpuResult = calculateMetricZ("cpuUsage");
  const latencyResult = calculateMetricZ("latencyMs");

  const isCpuAnomalous = cpuResult.isAnomalous;
  const isLatencyAnomalous = latencyResult.isAnomalous;

  const isAnomalous = errorAnomaly || isCpuAnomalous || isLatencyAnomalous;

  if (!isAnomalous) {
    return; // No anomaly detected
  }

  console.log(
    `[Anomaly Detected] Project: ${projectId}, Service: ${serviceId}, Env: ${environment}. ` +
      `Error Spike: ${errorAnomaly} (Z-Score: ${errorZScore.toFixed(2)}, Errors: ${currentErrorCount}), ` +
      `CPU Spike: ${isCpuAnomalous} (Z-Score: ${cpuResult.zScore.toFixed(2)}, CPU: ${cpuResult.currentAvg.toFixed(1)}%), ` +
      `Latency Spike: ${isLatencyAnomalous} (Z-Score: ${latencyResult.zScore.toFixed(2)}, Latency: ${latencyResult.currentAvg.toFixed(1)}ms)`,
  );

  // 5. Deduplication check: Is there already an open/investigating incident created recently?
  const recentIncident = await Incident.findOne({
    projectId: new Types.ObjectId(projectId),
    serviceId: new Types.ObjectId(serviceId),
    status: { $in: ["open", "investigating"] },
    createdAt: { $gte: new Date(nowMs - 15 * 60 * 1000) }, // last 15 minutes
  });

  const currentWindowLogs = errorLogs.filter(
    (l) => l.timestamp.getTime() >= currentWindowStart,
  );

  if (recentIncident) {
    console.log(
      `[Anomaly Engine] Appending logs to existing incident: ${recentIncident._id}`,
    );

    // Add new log IDs to relatedLogs array
    const existingLogIds = recentIncident.relatedLogs.map((id) =>
      id.toString(),
    );
    const newLogIds = currentWindowLogs.map((l) => l._id.toString());
    const mergedLogIds = Array.from(
      new Set([...existingLogIds, ...newLogIds]),
    ).map((id) => new Types.ObjectId(id));

    recentIncident.relatedLogs = mergedLogIds;
    await recentIncident.save();
    return;
  }

  // 6. Gather context for LLM Analysis
  // Get recent deploys (preceding 30 minutes before anomaly started)
  const thirtyMinsBeforeAnomaly = currentWindowStart - 30 * 60 * 1000;
  const recentDeploys = await Deploy.find({
    projectId: new Types.ObjectId(projectId),
    serviceId: new Types.ObjectId(serviceId),
    environment,
    deployedAt: { $gte: new Date(thirtyMinsBeforeAnomaly), $lte: now },
  }).sort({ deployedAt: -1 });

  // Map to LLM structures
  const logContexts: LogContext[] = currentWindowLogs.slice(0, 15).map((l) => ({
    timestamp: l.timestamp.toISOString(),
    level: l.level,
    message: l.message,
    metadata: l.metadata,
    traceId: l.traceId,
  }));

  const deployContexts: DeployContext[] = recentDeploys.map((d) => ({
    deployedAt: d.deployedAt.toISOString(),
    commitSha: d.commitSha,
    commitMessage: d.commitMessage,
    branch: d.branch,
  }));

  // Fetch Service Name
  const service = await Service.findById(serviceId);
  const serviceName = service ? service.name : "unknown-service";

  // 7. Invoke AI reasoning pipeline
  let analysis;
  try {
    const currentLogsText = logContexts.map((l) => l.message).join("\n");
    const historicalIncidents = await retrieveSimilarIncidents(
      projectId,
      currentLogsText,
    );

    // Construct a metric anomaly summary description
    let anomalyMetricDesc = "";
    if (errorAnomaly) {
      anomalyMetricDesc += `Error Count: Z-Score ${errorZScore.toFixed(2)}, Current error count: ${currentErrorCount} (baseline average: ${errorMean.toFixed(2)}). `;
    }
    if (isCpuAnomalous) {
      anomalyMetricDesc += `CPU Usage: Z-Score ${cpuResult.zScore.toFixed(2)}, Current avg: ${cpuResult.currentAvg.toFixed(1)}% (baseline average: ${cpuResult.historicalMean.toFixed(1)}%). `;
    }
    if (isLatencyAnomalous) {
      anomalyMetricDesc += `Latency: Z-Score ${latencyResult.zScore.toFixed(2)}, Current avg: ${latencyResult.currentAvg.toFixed(1)}ms (baseline average: ${latencyResult.historicalMean.toFixed(1)}ms). `;
    }

    analysis = await generateIncidentAnalysis({
      serviceName,
      environment,
      detectedAt: now.toISOString(),
      anomalyMetric: anomalyMetricDesc || `Metric deviation detected`,
      logs: logContexts,
      deploys: deployContexts,
      historicalIncidents,
      bypassLLM: projectDoc?.plan === "free",
      aiConfig: projectDoc
        ? {
            provider: projectDoc.aiProvider,
            apiKey: projectDoc.aiApiKey,
            model: projectDoc.aiModel,
            baseUrl: projectDoc.aiBaseUrl,
            enabled: projectDoc.aiEnabled,
            anthropicApiKey: projectDoc.anthropicApiKey,
            anthropicModel: projectDoc.anthropicModel,
            openaiApiKey: projectDoc.openaiApiKey,
            openaiModel: projectDoc.openaiModel,
            openaiBaseUrl: projectDoc.openaiBaseUrl,
            aicreditsApiKey: projectDoc.aicreditsApiKey,
            aicreditsModel: projectDoc.aicreditsModel,
            customAiApiKey: projectDoc.customAiApiKey,
            customAiModel: projectDoc.customAiModel,
            customAiBaseUrl: projectDoc.customAiBaseUrl,
            fallbackOrder: projectDoc.aiFallbackOrder,
          }
        : undefined,
    });
  } catch (err) {
    console.error(
      "[Anomaly Engine] LLM Incident reasoning failed, creating baseline fallback...",
      err,
    );

    let fallbackTitle = `High error volume in ${serviceName}`;
    let fallbackSummary = `The service "${serviceName}" encountered an unexpected error spike in 5 minutes.`;
    let fallbackRootCause = `Exception rate exceeded normal baseline threshold.`;
    let fallbackSuggestedFix = [
      "Inspect recent error logs for service exceptions.",
      "Verify server availability.",
    ];

    if (isCpuAnomalous && !errorAnomaly) {
      fallbackTitle = `CPU spike detected in ${serviceName}`;
      fallbackSummary = `The service "${serviceName}" encountered an unexpected CPU usage spike of ${cpuResult.currentAvg.toFixed(1)}% (baseline: ${cpuResult.historicalMean.toFixed(1)}%).`;
      fallbackRootCause = `CPU utilization exceeded normal baseline threshold.`;
      fallbackSuggestedFix = [
        "Check database connection scaling and heavy queries.",
        "Verify if there is a memory leak or CPU leak in the application.",
      ];
    } else if (isLatencyAnomalous && !errorAnomaly) {
      fallbackTitle = `Latency spike detected in ${serviceName}`;
      fallbackSummary = `The service "${serviceName}" encountered an unexpected latency spike of ${latencyResult.currentAvg.toFixed(1)}ms (baseline: ${latencyResult.historicalMean.toFixed(1)}ms).`;
      fallbackRootCause = `Service response times exceeded normal baseline threshold.`;
      fallbackSuggestedFix = [
        "Check downstream dependency status and third-party API performance.",
        "Verify database read/write latency metrics.",
      ];
    }

    analysis = {
      title: fallbackTitle,
      summary: fallbackSummary,
      rootCause: fallbackRootCause,
      impact: `Affected service operations in ${environment} environment.`,
      suggestedFix: fallbackSuggestedFix,
      confidence: 0.5,
    };
  }

  // 8. Create Incident
  const incident = await Incident.create({
    projectId: new Types.ObjectId(projectId),
    serviceId: new Types.ObjectId(serviceId),
    title: analysis.title,
    summary: analysis.summary,
    rootCause: analysis.rootCause,
    impact: analysis.impact,
    suggestedFix: analysis.suggestedFix,
    confidence: analysis.confidence,
    status: "open",
    relatedLogs: currentWindowLogs.map((l) => l._id),
    deployId: recentDeploys[0]?._id || undefined,
    ttd: 5 * 60 * 1000,
  });

  // Invalidate dashboard cache
  await delCache(`dashboard:project:${projectId}`);

  console.log(
    `[Anomaly Engine] Created Incident: ${incident._id} - ${analysis.title}`,
  );

  // 9. Dispatch Multi-channel Webhook Alerts (Slack, Discord, MS Teams)
  if (projectDoc) {
    const slackUrl =
      projectDoc.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
    const discordUrl = projectDoc.discordWebhookUrl;
    const teamsUrl = projectDoc.teamsWebhookUrl;

    if (!slackUrl && !discordUrl && !teamsUrl) {
      console.log(
        "\n--- [Incident Alert Payload Logged (No Webhooks Configured)] ---",
      );
      console.log(`Incident ID: ${incident._id}`);
      console.log(`Title: ${analysis.title}`);
      console.log(`Summary: ${analysis.summary}`);
      console.log(`Root Cause: ${analysis.rootCause}`);
      console.log(
        "--------------------------------------------------------------\n",
      );
    } else {
      await dispatchMultiChannelIncidentAlert(
        projectDoc,
        serviceName,
        environment,
        incident._id.toString(),
        analysis,
      );
    }
  }
}
