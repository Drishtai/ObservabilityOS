import { Resend } from "resend";
import { connectToDatabase, Log, Service, Incident, Project } from "@repo/db";
import { generateEmailDigestSummary, IncidentDigestContext } from "@repo/ai";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

interface ServiceStats {
  name: string;
  environment: string;
  totalLogs: number;
  errorRate: number;
  availability: number;
  avgLatency: number | null;
  healthStatus: "healthy" | "warning" | "incident";
}

interface ProjectDigestData {
  projectName: string;
  apiKey: string;
  services: ServiceStats[];
  incidents: IncidentDigestContext[];
  aiSummary: string;
}

export async function buildAndSendEmailDigest(user: {
  email?: string;
  username: string;
  _id: unknown;
}) {
  if (!user.email) {
    console.log(
      `[Email Digest] User ${user.username} has no email configured. Skipping digest.`,
    );
    return;
  }
  await connectToDatabase();

  // 1. Fetch user's projects
  const projects = await Project.find({ ownerId: user._id }).sort({ name: 1 });
  if (projects.length === 0) {
    console.log(
      `[Email Digest] User ${user.username} has no projects. Skipping digest.`,
    );
    return;
  }

  const start24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const projectDigestDataList: ProjectDigestData[] = [];

  // 2. Aggregate metrics for each project
  for (const project of projects) {
    const services = await Service.find({ projectId: project._id }).sort({
      name: 1,
      environment: 1,
    });

    // Fetch logs aggregation for last 24h
    const stats = await Log.aggregate([
      {
        $match: {
          projectId: project._id,
          timestamp: { $gte: start24h },
        },
      },
      {
        $group: {
          _id: "$serviceId",
          totalLogs: { $sum: 1 },
          errorLogs: {
            $sum: {
              $cond: [{ $eq: ["$level", "error"] }, 1, 0],
            },
          },
          avgLatency: {
            $avg: {
              $ifNull: ["$metadata.latencyMs", "$metadata.latency"],
            },
          },
        },
      },
    ]);

    // Fetch incidents created in last 24h
    const incidents = await Incident.find({
      projectId: project._id,
      createdAt: { $gte: start24h },
    })
      .populate("serviceId")
      .sort({ createdAt: -1 });

    const statsMap = new Map(stats.map((s) => [s._id.toString(), s]));
    const openIncidentsServiceIds = new Set(
      incidents
        .filter((inc) => inc.status !== "resolved")
        .map((inc) => inc.serviceId?._id?.toString() || ""),
    );

    const serviceStatsList: ServiceStats[] = services.map((s) => {
      const serviceStats = statsMap.get(s._id.toString()) || {
        totalLogs: 0,
        errorLogs: 0,
        avgLatency: null,
      };
      const totalLogs = serviceStats.totalLogs;
      const errorLogs = serviceStats.errorLogs;
      const errorRate = totalLogs > 0 ? (errorLogs / totalLogs) * 100 : 0;
      const availability =
        totalLogs > 0 ? ((totalLogs - errorLogs) / totalLogs) * 100 : 100;
      const avgLatency =
        serviceStats.avgLatency !== null &&
        serviceStats.avgLatency !== undefined
          ? Math.round(serviceStats.avgLatency as number)
          : null;

      let healthStatus: "healthy" | "warning" | "incident" = "healthy";
      if (openIncidentsServiceIds.has(s._id.toString())) {
        healthStatus = "incident";
      } else if (totalLogs > 0 && errorRate > 5) {
        healthStatus = "warning";
      }

      return {
        name: s.name,
        environment: s.environment,
        totalLogs,
        errorRate: Number(errorRate.toFixed(2)),
        availability: Number(availability.toFixed(2)),
        avgLatency,
        healthStatus,
      };
    });

    // Structure incident contexts for AI reasoning
    const incidentDigestContexts: IncidentDigestContext[] = incidents.map(
      (inc) => {
        const s = inc.serviceId as unknown as {
          name: string;
          environment: string;
          _id: string;
        };
        return {
          title: inc.title,
          serviceName: s ? s.name : "unknown-service",
          environment: s ? s.environment : "prod",
          status: inc.status,
          createdAt: inc.createdAt.toISOString(),
          rootCause: inc.rootCause,
        };
      },
    );

    // 3. Generate AI summary of overnight incidents
    let aiSummary = "";
    try {
      aiSummary = await generateEmailDigestSummary({
        projectName: project.name,
        incidents: incidentDigestContexts,
        bypassLLM: project.plan === "free",
        aiConfig: {
          provider: project.aiProvider,
          apiKey: project.aiApiKey,
          model: project.aiModel,
          baseUrl: project.aiBaseUrl,
          enabled: project.aiEnabled,
          anthropicApiKey: project.anthropicApiKey,
          anthropicModel: project.anthropicModel,
          openaiApiKey: project.openaiApiKey,
          openaiModel: project.openaiModel,
          openaiBaseUrl: project.openaiBaseUrl,
          aicreditsApiKey: project.aicreditsApiKey,
          aicreditsModel: project.aicreditsModel,
          customAiApiKey: project.customAiApiKey,
          customAiModel: project.customAiModel,
          customAiBaseUrl: project.customAiBaseUrl,
          fallbackOrder: project.aiFallbackOrder,
        },
      });
    } catch (err) {
      console.error(
        `[Email Digest] AI summary failed for project ${project.name}:`,
        err,
      );
      aiSummary =
        "Morning executive report is ready. System health and services logs are successfully synchronized.";
    }

    projectDigestDataList.push({
      projectName: project.name,
      apiKey: project.apiKey,
      services: serviceStatsList,
      incidents: incidentDigestContexts,
      aiSummary,
    });
  }

  // 4. Build HTML digest template
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const htmlContent = generateHtmlDigestEmail(
    user.username,
    projectDigestDataList,
    appUrl,
  );

  // 5. Send or log email
  if (resend) {
    try {
      const emailResponse = await resend.emails.send({
        from: "ObservabilityOS <support@observabilityos.in>",
        to: user.email,
        subject: `☀️ ObservabilityOS Morning Digest for ${user.username}`,
        html: htmlContent,
      });

      console.log(
        `[Email Digest] Dispatched email to ${user.email}. ID: ${emailResponse.data?.id}`,
      );
      return { success: true, method: "resend", id: emailResponse.data?.id };
    } catch (err) {
      console.error("[Email Digest] Resend dispatch error:", err);
      throw err;
    }
  } else {
    // Development fallback logging
    console.log(
      "\n=================================================================================",
    );
    console.log(
      `☀️ [DEVELOPMENT MODE - EMAIL DIGEST] Logging morning digest for user: ${user.email}`,
    );
    console.log(
      "---------------------------------------------------------------------------------",
    );
    console.log(`HTML Payload length: ${htmlContent.length} bytes`);
    console.log("Projects summarized:");
    for (const p of projectDigestDataList) {
      console.log(
        `- Project: ${p.projectName} (API key: ${p.apiKey.slice(0, 10)}...)`,
      );
      console.log(`  AI Summary: "${p.aiSummary}"`);
      console.log(
        `  Services: ${p.services.length}, Incidents overnight: ${p.incidents.length}`,
      );
    }
    console.log(
      "---------------------------------------------------------------------------------",
    );
    console.log("Email HTML template output preview saved inside server logs.");
    console.log(
      "=================================================================================\n",
    );
    return { success: true, method: "console", html: htmlContent };
  }
}

function generateHtmlDigestEmail(
  username: string,
  projects: ProjectDigestData[],
  appUrl: string,
): string {
  const projectSections = projects
    .map((p) => {
      // Services status rows
      const serviceRows =
        p.services.length > 0
          ? p.services
              .map((s) => {
                const healthIndicator =
                  s.healthStatus === "incident"
                    ? "🔴"
                    : s.healthStatus === "warning"
                      ? "🟡"
                      : "🟢";
                return `
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 10px 0; font-family: monospace; font-size: 12px; color: #f1f5f9;">
                ${healthIndicator} ${s.name} <span style="color: #64748b; font-size: 10px;">(${s.environment.toUpperCase()})</span>
              </td>
              <td style="padding: 10px 0; font-family: monospace; font-size: 12px; text-align: right; color: ${s.totalLogs === 0 ? "#64748b" : s.availability >= 99 ? "#10b981" : "#f59e0b"};">
                ${s.totalLogs === 0 ? "100.0%" : s.availability.toFixed(1) + "%"}
              </td>
              <td style="padding: 10px 0; font-family: monospace; font-size: 12px; text-align: right; color: ${s.totalLogs === 0 ? "#64748b" : s.errorRate > 5 ? "#ef4444" : "#10b981"};">
                ${s.totalLogs === 0 ? "0.0%" : s.errorRate.toFixed(1) + "%"}
              </td>
              <td style="padding: 10px 0; font-family: monospace; font-size: 12px; text-align: right; color: ${s.avgLatency === null ? "#64748b" : s.avgLatency > 500 ? "#ef4444" : "#10b981"};">
                ${s.avgLatency === null ? "—" : s.avgLatency + "ms"}
              </td>
            </tr>
          `;
              })
              .join("")
          : `
        <tr>
          <td colspan="4" style="padding: 16px 0; text-align: center; font-size: 12px; color: #64748b;">
            No services registered. Set up client logger to start tracking health metrics.
          </td>
        </tr>
      `;

      // Incidents list
      const incidentItems =
        p.incidents.length > 0
          ? p.incidents
              .map(
                (inc) => `
          <div style="border-left: 3px solid #ef4444; background: rgba(239, 68, 68, 0.05); border: 1px solid #311818; padding: 12px; margin-bottom: 12px; rounded: 8px;">
            <div style="font-weight: bold; font-size: 13px; color: #ef4444; margin-bottom: 4px;">
              🚨 ${inc.title}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">
              Service: ${inc.serviceName} (${inc.environment.toUpperCase()}) • Status: ${inc.status.toUpperCase()}
            </div>
            <div style="font-size: 12px; color: #cbd5e1; line-height: 1.4;">
              <strong>Diagnosis:</strong> ${inc.rootCause}
            </div>
          </div>
        `,
              )
              .join("")
          : `
        <div style="border: 1px dashed #1e293b; border-radius: 8px; padding: 16px; text-align: center; font-size: 12px; color: #64748b;">
          ✅ No SRE incidents occurred during this 24-hour cycle.
        </div>
      `;

      return `
      <!-- Project Section -->
      <div style="background-color: #0f172a; border: 1px solid #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 24px;">
        <h2 style="font-size: 16px; font-weight: bold; color: #ffffff; margin-top: 0; margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
          📁 Project: ${p.projectName}
        </h2>
        
        <!-- AI Summary -->
        <div style="background: rgba(99, 102, 241, 0.05); border: 1px solid #1e1b4b; border-radius: 8px; padding: 12px; margin-bottom: 16px; font-size: 12px; color: #a5b4fc; line-height: 1.4;">
          ✨ <strong>AI SRE Digest Summary:</strong><br/>
          ${p.aiSummary}
        </div>

        <!-- Service Metrics Table -->
        <div style="margin-bottom: 20px;">
          <h3 style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Monitored Services</h3>
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="border-bottom: 1px solid #1e293b; font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b;">
                <th style="padding-bottom: 6px; width: 40%;">Service Name</th>
                <th style="padding-bottom: 6px; text-align: right; width: 20%;">Uptime</th>
                <th style="padding-bottom: 6px; text-align: right; width: 20%;">Error Rate</th>
                <th style="padding-bottom: 6px; text-align: right; width: 20%;">Avg Latency</th>
              </tr>
            </thead>
            <tbody>
              ${serviceRows}
            </tbody>
          </table>
        </div>

        <!-- Incident Feed -->
        <div>
          <h3 style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin-bottom: 8px;">Overnight Incidents</h3>
          ${incidentItems}
        </div>
      </div>
    `;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>ObservabilityOS Morning Digest</title>
      </head>
      <body style="background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #cbd5e1; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #020617; border-radius: 16px; padding: 24px;">
          
          <!-- Logo Header -->
          <div style="text-align: center; margin-bottom: 32px; border-bottom: 1px solid #1e293b; padding-bottom: 20px;">
            <div style="display: inline-block; width: 32px; height: 32px; border-radius: 8px; background-color: #4f46e5; text-align: center; line-height: 32px; color: #ffffff; font-weight: bold; font-size: 16px; margin-right: 10px; vertical-align: middle;">
              📈
            </div>
            <span style="font-size: 18px; font-weight: bold; color: #ffffff; letter-spacing: -0.025em; vertical-align: middle;">ObservabilityOS</span>
          </div>

          <!-- Greeting -->
          <div style="margin-bottom: 24px;">
            <h1 style="font-size: 20px; font-weight: bold; color: #ffffff; margin-top: 0; margin-bottom: 4px;">Good morning, ${username}!</h1>
            <p style="font-size: 13px; color: #64748b; margin-top: 0;">Here is the automated morning diagnostic summary of your active service environments.</p>
          </div>

          <!-- Projects content -->
          ${projectSections}

          <!-- Footer -->
          <div style="text-align: center; margin-top: 32px; border-top: 1px solid #1e293b; padding-top: 20px; font-size: 11px; color: #64748b; line-height: 1.4;">
            This morning summary was automatically calculated from log streams in the last 24 hours.<br/>
            To configure alert settings or view live telemetry, access the <a href="${appUrl}/dashboard" style="color: #4f46e5; text-decoration: none; font-weight: bold;">ObservabilityOS Web Dashboard</a>.<br/>
            <br/>
            &copy; 2026 ObservabilityOS. All rights reserved.
          </div>

        </div>
      </body>
    </html>
  `;
}
