import { IProject } from "@repo/db";
import { getCircuitBreaker } from "./resilience";

export interface AlertPayload {
  projectId: string;
  serviceId: string;
  serviceName: string;
  environment: string;
  sloName: string;
  sloType: "availability" | "latency";
  latencyThresholdMs?: number;
  target: number;
  compliance: number;
  budgetRemaining: number;
  budgetRemainingPercent: number;
  previousStatus: "healthy" | "warning" | "breached";
  currentStatus: "healthy" | "warning" | "breached";
}

// Visual color helpers
const SEVERITY_COLORS = {
  breached: {
    hex: "#E74C3C", // Red
    decimal: 15158332,
    cleanHex: "E74C3C",
    emoji: "🚨",
    label: "BREACHED",
  },
  warning: {
    hex: "#F1C40F", // Yellow
    decimal: 15848719,
    cleanHex: "F1C40F",
    emoji: "⚠️",
    label: "WARNING",
  },
  healthy: {
    hex: "#2ECC71", // Green
    decimal: 3066993,
    cleanHex: "2ECC71",
    emoji: "✅",
    label: "RECOVERED / HEALTHY",
  },
};

export interface AlertAdapter {
  send(webhookUrl: string, payload: AlertPayload): Promise<boolean>;
}

export class SlackAlertAdapter implements AlertAdapter {
  async send(webhookUrl: string, payload: AlertPayload): Promise<boolean> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const serviceLink = `${appUrl}/dashboard/services/${payload.serviceId}?projectId=${payload.projectId}`;

    const config = SEVERITY_COLORS[payload.currentStatus];
    const prevEmoji = SEVERITY_COLORS[payload.previousStatus].emoji;
    const currEmoji = config.emoji;

    const typeLabel =
      payload.sloType === "latency"
        ? `Latency (<${payload.latencyThresholdMs ?? 500}ms)`
        : "Availability";

    const slackPayload = {
      attachments: [
        {
          color: config.hex,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `${currEmoji} SLO ${config.label}: ${payload.serviceName}`,
                emoji: true,
              },
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*SLO:* ${payload.sloName}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Type:* ${typeLabel}`,
                },
                {
                  type: "mrkdwn",
                  text: `*Environment:* \`${payload.environment}\``,
                },
                {
                  type: "mrkdwn",
                  text: `*Target Compliance:* ${payload.target}%`,
                },
              ],
            },
            {
              type: "section",
              fields: [
                {
                  type: "mrkdwn",
                  text: `*Current Compliance:* *${payload.compliance}%*`,
                },
                {
                  type: "mrkdwn",
                  text: `*Error Budget Remaining:* *${payload.budgetRemaining} reqs* (${payload.budgetRemainingPercent}%)`,
                },
              ],
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Transition:* \`${payload.previousStatus}\` ${prevEmoji} ➡️ *${payload.currentStatus}* ${currEmoji}`,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "Investigate SLO Details",
                    emoji: true,
                  },
                  style:
                    payload.currentStatus === "breached" ? "danger" : "default",
                  url: serviceLink,
                  action_id: "view_slo_details",
                },
              ],
            },
          ],
        },
      ],
    };

    const breaker = getCircuitBreaker({
      name: "SlackAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 3000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackPayload),
          });
          return response.ok;
        },
        () => {
          console.warn(
            "[SlackAlertAdapter] Fallback triggered. Webhook failed or circuit open.",
          );
          return false;
        },
      );
    } catch (err) {
      console.error("[SlackAlertAdapter] Failed to dispatch alert:", err);
      return false;
    }
  }
}

export class DiscordAlertAdapter implements AlertAdapter {
  async send(webhookUrl: string, payload: AlertPayload): Promise<boolean> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const serviceLink = `${appUrl}/dashboard/services/${payload.serviceId}?projectId=${payload.projectId}`;

    const config = SEVERITY_COLORS[payload.currentStatus];
    const prevEmoji = SEVERITY_COLORS[payload.previousStatus].emoji;
    const currEmoji = config.emoji;

    const typeLabel =
      payload.sloType === "latency"
        ? `Latency (<${payload.latencyThresholdMs ?? 500}ms)`
        : "Availability";

    const discordPayload = {
      embeds: [
        {
          title: `${currEmoji} SLO ${config.label}: ${payload.serviceName}`,
          color: config.decimal,
          url: serviceLink,
          fields: [
            { name: "SLO Name", value: payload.sloName, inline: true },
            { name: "Type", value: typeLabel, inline: true },
            { name: "Environment", value: payload.environment, inline: true },
            {
              name: "Target Compliance",
              value: `${payload.target}%`,
              inline: true,
            },
            {
              name: "Current Compliance",
              value: `${payload.compliance}%`,
              inline: true,
            },
            {
              name: "Error Budget Remaining",
              value: `${payload.budgetRemaining} reqs (${payload.budgetRemainingPercent}%)`,
              inline: true,
            },
            {
              name: "Transition",
              value: `\`${payload.previousStatus}\` ${prevEmoji} ➡️ **${payload.currentStatus}** ${currEmoji}`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    const breaker = getCircuitBreaker({
      name: "DiscordAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 3000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(discordPayload),
          });
          return response.ok;
        },
        () => {
          console.warn(
            "[DiscordAlertAdapter] Fallback triggered. Webhook failed or circuit open.",
          );
          return false;
        },
      );
    } catch (err) {
      console.error("[DiscordAlertAdapter] Failed to dispatch alert:", err);
      return false;
    }
  }
}

export class TeamsAlertAdapter implements AlertAdapter {
  async send(webhookUrl: string, payload: AlertPayload): Promise<boolean> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const serviceLink = `${appUrl}/dashboard/services/${payload.serviceId}?projectId=${payload.projectId}`;

    const config = SEVERITY_COLORS[payload.currentStatus];
    const prevEmoji = SEVERITY_COLORS[payload.previousStatus].emoji;
    const currEmoji = config.emoji;

    const typeLabel =
      payload.sloType === "latency"
        ? `Latency (<${payload.latencyThresholdMs ?? 500}ms)`
        : "Availability";

    const teamsPayload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: config.cleanHex,
      summary: `SLO ${config.label}: ${payload.serviceName}`,
      title: `${currEmoji} SLO ${config.label}: ${payload.serviceName}`,
      sections: [
        {
          facts: [
            { name: "SLO Name", value: payload.sloName },
            { name: "Type", value: typeLabel },
            { name: "Environment", value: payload.environment },
            { name: "Target Compliance", value: `${payload.target}%` },
            { name: "Current Compliance", value: `${payload.compliance}%` },
            {
              name: "Error Budget Remaining",
              value: `${payload.budgetRemaining} reqs (${payload.budgetRemainingPercent}%)`,
            },
            {
              name: "Transition",
              value: `${payload.previousStatus} ${prevEmoji} ➡️ **${payload.currentStatus}** ${currEmoji}`,
            },
          ],
          markdown: true,
        },
      ],
      potentialAction: [
        {
          "@type": "OpenUri",
          name: "Investigate SLO",
          targets: [{ os: "default", uri: serviceLink }],
        },
      ],
    };

    const breaker = getCircuitBreaker({
      name: "TeamsAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 3000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(teamsPayload),
          });
          return response.ok;
        },
        () => {
          console.warn(
            "[TeamsAlertAdapter] Fallback triggered. Webhook failed or circuit open.",
          );
          return false;
        },
      );
    } catch (err) {
      console.error("[TeamsAlertAdapter] Failed to dispatch alert:", err);
      return false;
    }
  }
}

export class PagerDutyAlertAdapter implements AlertAdapter {
  async send(routingKey: string, payload: AlertPayload): Promise<boolean> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const serviceLink = `${appUrl}/dashboard/services/${payload.serviceId}?projectId=${payload.projectId}`;

    const dedupKey = `slo-${payload.projectId}-${payload.serviceId}-${payload.sloName.toLowerCase().replace(/\s+/g, "-")}`;
    const action = payload.currentStatus === "healthy" ? "resolve" : "trigger";
    const severity =
      payload.currentStatus === "breached"
        ? "critical"
        : payload.currentStatus === "warning"
          ? "warning"
          : "info";

    const pdPayload = {
      routing_key: routingKey,
      event_action: action,
      dedup_key: dedupKey,
      payload: {
        summary: `SLO ${payload.currentStatus.toUpperCase()}: ${payload.serviceName} - ${payload.sloName} (${payload.compliance}%)`,
        source: "ObservabilityOS",
        severity,
        component: payload.serviceName,
        custom_details: {
          sloName: payload.sloName,
          environment: payload.environment,
          target: `${payload.target}%`,
          currentCompliance: `${payload.compliance}%`,
          budgetRemaining: `${payload.budgetRemaining} reqs (${payload.budgetRemainingPercent}%)`,
          previousStatus: payload.previousStatus,
        },
      },
      links: [
        {
          href: serviceLink,
          text: "View Service & SLO Dashboard",
        },
      ],
    };

    const breaker = getCircuitBreaker({
      name: "PagerDutyAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 3000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(
            "https://events.pagerduty.com/v2/enqueue",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(pdPayload),
            },
          );
          return response.ok;
        },
        () => {
          console.warn("[PagerDutyAlertAdapter] Circuit breaker triggered.");
          return false;
        },
      );
    } catch (err) {
      console.error("[PagerDutyAlertAdapter] Failed:", err);
      return false;
    }
  }
}

export class OpsgenieAlertAdapter implements AlertAdapter {
  private region: "us" | "eu";

  constructor(region: "us" | "eu" = "us") {
    this.region = region;
  }

  async send(apiKey: string, payload: AlertPayload): Promise<boolean> {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const serviceLink = `${appUrl}/dashboard/services/${payload.serviceId}?projectId=${payload.projectId}`;
    const endpoint =
      this.region === "eu"
        ? "https://api.eu.opsgenie.com/v2/alerts"
        : "https://api.opsgenie.com/v2/alerts";

    const priority = payload.currentStatus === "breached" ? "P1" : "P3";
    const alias = `slo-${payload.projectId}-${payload.serviceId}-${payload.sloName.toLowerCase().replace(/\s+/g, "-")}`;

    const opsgeniePayload = {
      message: `SLO ${payload.currentStatus.toUpperCase()}: ${payload.serviceName} - ${payload.sloName}`,
      alias,
      description: `Current compliance is ${payload.compliance}% against target ${payload.target}%. Error budget remaining: ${payload.budgetRemaining} reqs.`,
      priority,
      tags: [
        "observability-os",
        "slo",
        payload.environment,
        payload.serviceName,
      ],
      details: {
        projectId: payload.projectId,
        serviceId: payload.serviceId,
        environment: payload.environment,
        dashboardUrl: serviceLink,
      },
    };

    const breaker = getCircuitBreaker({
      name: "OpsgenieAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 3000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `GenieKey ${apiKey}`,
            },
            body: JSON.stringify(opsgeniePayload),
          });
          return response.ok;
        },
        () => {
          console.warn("[OpsgenieAlertAdapter] Circuit breaker triggered.");
          return false;
        },
      );
    } catch (err) {
      console.error("[OpsgenieAlertAdapter] Failed:", err);
      return false;
    }
  }
}

export class JiraAlertAdapter {
  async createIssue(
    config: {
      host: string;
      email: string;
      apiToken: string;
      projectKey: string;
      issueType?: string;
    },
    summary: string,
    description: string,
  ): Promise<boolean> {
    const host = config.host.replace(/\/+$/, "");
    const endpoint = `${host}/rest/api/2/issue`;
    const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;

    const jiraPayload = {
      fields: {
        project: { key: config.projectKey },
        summary,
        description,
        issuetype: { name: config.issueType || "Bug" },
        labels: ["observability-os", "incident"],
      },
    };

    const breaker = getCircuitBreaker({
      name: "JiraAlerts",
      failureThreshold: 3,
      recoveryTimeoutMs: 10000,
      requestTimeoutMs: 4000,
    });

    try {
      return await breaker.execute(
        async () => {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
            },
            body: JSON.stringify(jiraPayload),
          });
          return response.ok;
        },
        () => {
          console.warn("[JiraAlertAdapter] Circuit breaker triggered.");
          return false;
        },
      );
    } catch (err) {
      console.error("[JiraAlertAdapter] Failed:", err);
      return false;
    }
  }
}

// Unified multi-channel dispatcher helper
export async function dispatchMultiChannelSloAlert(
  project: IProject,
  payload: AlertPayload,
): Promise<{
  slack: boolean;
  discord: boolean;
  teams: boolean;
  pagerduty: boolean;
  opsgenie: boolean;
}> {
  const results = {
    slack: false,
    discord: false,
    teams: false,
    pagerduty: false,
    opsgenie: false,
  };

  // Dispatch to Slack
  const slackUrl = project.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    const adapter = new SlackAlertAdapter();
    results.slack = await adapter.send(slackUrl, payload);
  }

  // Dispatch to Discord
  const discordUrl = project.discordWebhookUrl;
  if (discordUrl) {
    const adapter = new DiscordAlertAdapter();
    results.discord = await adapter.send(discordUrl, payload);
  }

  // Dispatch to Microsoft Teams
  const teamsUrl = project.teamsWebhookUrl;
  if (teamsUrl) {
    const adapter = new TeamsAlertAdapter();
    results.teams = await adapter.send(teamsUrl, payload);
  }

  // Dispatch to PagerDuty
  if (project.pagerdutyRoutingKey) {
    const adapter = new PagerDutyAlertAdapter();
    results.pagerduty = await adapter.send(
      project.pagerdutyRoutingKey,
      payload,
    );
  }

  // Dispatch to Opsgenie
  if (project.opsgenieApiKey) {
    const adapter = new OpsgenieAlertAdapter(project.opsgenieRegion || "us");
    results.opsgenie = await adapter.send(project.opsgenieApiKey, payload);
  }

  return results;
}

// Also implement a multi-channel dispatcher for regular AI Anomaly incidents to keep everything aligned
export async function dispatchMultiChannelIncidentAlert(
  project: IProject,
  serviceName: string,
  environment: string,
  incidentId: string,
  analysis: {
    title: string;
    summary: string;
    rootCause: string;
    suggestedFix: string[];
  },
): Promise<{
  slack: boolean;
  discord: boolean;
  teams: boolean;
  pagerduty: boolean;
  opsgenie: boolean;
  jira: boolean;
}> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const dashboardLink = `${appUrl}/dashboard/incidents?projectId=${project._id.toString()}&incidentId=${incidentId}`;

  const results = {
    slack: false,
    discord: false,
    teams: false,
    pagerduty: false,
    opsgenie: false,
    jira: false,
  };

  // Slack
  const slackUrl = project.slackWebhookUrl || process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    const slackPayload = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "🚨 ObservabilityOS Incident Alert",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            { type: "mrkdwn", text: `*Service:*\n\`${serviceName}\`` },
            { type: "mrkdwn", text: `*Environment:*\n\`${environment}\`` },
          ],
        },
        {
          type: "section",
          text: { type: "mrkdwn", text: `*Title:*\n*${analysis.title}*` },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*AI Analysis Summary:*\n${analysis.summary}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Root Cause:*\n${analysis.rootCause}`,
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*Suggested Troubleshooting Steps:*\n${analysis.suggestedFix
              .map((step: string, idx: number) => `${idx + 1}. ${step}`)
              .join("\n")}`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Investigate Incident",
                emoji: true,
              },
              style: "danger",
              url: dashboardLink,
              action_id: "view_incident_dashboard",
            },
          ],
        },
      ],
    };

    try {
      const response = await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });
      results.slack = response.ok;
    } catch (err) {
      console.error("[SlackIncidentAlert] Failed:", err);
    }
  }

  // Discord Embed
  if (project.discordWebhookUrl) {
    const discordPayload = {
      embeds: [
        {
          title: `🚨 Incident Alert: ${serviceName} (${environment})`,
          description: `**${analysis.title}**\n\n**AI Analysis Summary:**\n${analysis.summary}\n\n**Root Cause:**\n${analysis.rootCause}`,
          color: 15158332, // Red
          url: dashboardLink,
          fields: [
            {
              name: "Suggested Troubleshooting Steps",
              value: analysis.suggestedFix
                .map((step: string, idx: number) => `${idx + 1}. ${step}`)
                .join("\n"),
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    };

    try {
      const response = await fetch(project.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      });
      results.discord = response.ok;
    } catch (err) {
      console.error("[DiscordIncidentAlert] Failed:", err);
    }
  }

  // Microsoft Teams MessageCard
  if (project.teamsWebhookUrl) {
    const teamsPayload = {
      "@type": "MessageCard",
      "@context": "http://schema.org/extensions",
      themeColor: "E74C3C",
      summary: `Incident Alert: ${serviceName}`,
      title: `🚨 Incident Alert: ${serviceName} (${environment})`,
      sections: [
        {
          activityTitle: analysis.title,
          activitySubtitle: `Root Cause: ${analysis.rootCause}`,
          text: `**AI Analysis Summary:**\n${analysis.summary}\n\n**Suggested Troubleshooting:**\n${analysis.suggestedFix
            .map((step: string, idx: number) => `${idx + 1}. ${step}`)
            .join("\n")}`,
          markdown: true,
        },
      ],
      potentialAction: [
        {
          "@type": "OpenUri",
          name: "Investigate Incident",
          targets: [{ os: "default", uri: dashboardLink }],
        },
      ],
    };

    try {
      const response = await fetch(project.teamsWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamsPayload),
      });
      results.teams = response.ok;
    } catch (err) {
      console.error("[TeamsIncidentAlert] Failed:", err);
    }
  }

  // PagerDuty Events API v2
  if (project.pagerdutyRoutingKey) {
    const pdPayload = {
      routing_key: project.pagerdutyRoutingKey,
      event_action: "trigger",
      dedup_key: `incident-${project._id.toString()}-${incidentId}`,
      payload: {
        summary: `🚨 Incident: ${serviceName} - ${analysis.title}`,
        source: "ObservabilityOS",
        severity: "critical",
        component: serviceName,
        custom_details: {
          incidentId,
          environment,
          summary: analysis.summary,
          rootCause: analysis.rootCause,
          suggestedFix: analysis.suggestedFix.join("; "),
        },
      },
      links: [
        {
          href: dashboardLink,
          text: "Open Incident in ObservabilityOS",
        },
      ],
    };

    try {
      const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pdPayload),
      });
      results.pagerduty = response.ok;
    } catch (err) {
      console.error("[PagerDutyIncidentAlert] Failed:", err);
    }
  }

  // Opsgenie Alert API
  if (project.opsgenieApiKey) {
    const region = project.opsgenieRegion || "us";
    const endpoint =
      region === "eu"
        ? "https://api.eu.opsgenie.com/v2/alerts"
        : "https://api.opsgenie.com/v2/alerts";

    const opsPayload = {
      message: `Incident on ${serviceName}: ${analysis.title}`,
      alias: `incident-${project._id.toString()}-${incidentId}`,
      description: `${analysis.summary}\n\nRoot Cause: ${analysis.rootCause}`,
      priority: "P1",
      tags: ["observability-os", "incident", environment, serviceName],
      details: {
        incidentId,
        environment,
        service: serviceName,
        dashboardUrl: dashboardLink,
      },
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `GenieKey ${project.opsgenieApiKey}`,
        },
        body: JSON.stringify(opsPayload),
      });
      results.opsgenie = response.ok;
    } catch (err) {
      console.error("[OpsgenieIncidentAlert] Failed:", err);
    }
  }

  // Jira Issue Creation
  if (
    project.jiraHost &&
    project.jiraEmail &&
    project.jiraApiToken &&
    project.jiraProjectKey
  ) {
    const jiraAdapter = new JiraAlertAdapter();
    const summary = `[Incident] ${serviceName} - ${analysis.title}`;
    const description = `*Incident Summary:*\n${analysis.summary}\n\n*Root Cause:*\n${analysis.rootCause}\n\n*Environment:* ${environment}\n*Service:* ${serviceName}\n*Dashboard Link:* ${dashboardLink}\n\n*Suggested Fixes:*\n${analysis.suggestedFix.map((s, i) => `${i + 1}. ${s}`).join("\n")}`;

    results.jira = await jiraAdapter.createIssue(
      {
        host: project.jiraHost,
        email: project.jiraEmail,
        apiToken: project.jiraApiToken,
        projectKey: project.jiraProjectKey,
        issueType: project.jiraIssueType || "Bug",
      },
      summary,
      description,
    );
  }

  return results;
}
