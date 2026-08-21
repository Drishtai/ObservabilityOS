import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PagerDutyAlertAdapter,
  OpsgenieAlertAdapter,
  JiraAlertAdapter,
  dispatchMultiChannelSloAlert,
  dispatchMultiChannelIncidentAlert,
  AlertPayload,
} from "./alerts";
import { IProject } from "@repo/db";
import mongoose from "mongoose";

describe("SRE Alerting Integrations (PagerDuty, Opsgenie, Jira)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const samplePayload: AlertPayload = {
    projectId: "proj_123",
    serviceId: "srv_auth",
    serviceName: "auth-service",
    environment: "prod",
    sloName: "Login Availability 99.9%",
    sloType: "availability",
    target: 99.9,
    compliance: 94.2,
    budgetRemaining: -45,
    budgetRemainingPercent: 0,
    previousStatus: "healthy",
    currentStatus: "breached",
  };

  it("should format and dispatch PagerDuty Events API v2 trigger alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new PagerDutyAlertAdapter();
    const success = await adapter.send(
      "pd-test-routing-key-xyz",
      samplePayload,
    );

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://events.pagerduty.com/v2/enqueue");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.routing_key).toBe("pd-test-routing-key-xyz");
    expect(body.event_action).toBe("trigger");
    expect(body.payload.severity).toBe("critical");
    expect(body.payload.summary).toContain("SLO BREACHED: auth-service");
  });

  it("should format and dispatch Opsgenie alert to EU region endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpsgenieAlertAdapter("eu");
    const success = await adapter.send("genie-api-key-eu-99", samplePayload);

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.eu.opsgenie.com/v2/alerts");
    expect(options.headers).toMatchObject({
      Authorization: "GenieKey genie-api-key-eu-99",
    });

    const body = JSON.parse(options.body as string);
    expect(body.message).toContain("SLO BREACHED");
    expect(body.priority).toBe("P1");
  });

  it("should create Jira issue ticket with Basic Authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new JiraAlertAdapter();
    const success = await adapter.createIssue(
      {
        host: "https://acme.atlassian.net",
        email: "sre@acme.com",
        apiToken: "jira_sec_token_123",
        projectKey: "SRE",
        issueType: "Incident",
      },
      "[Incident] auth-service database connection failed",
      "Detailed description of outage",
    );

    expect(success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://acme.atlassian.net/rest/api/2/issue");

    const expectedAuth = `Basic ${Buffer.from("sre@acme.com:jira_sec_token_123").toString("base64")}`;
    expect(options.headers).toMatchObject({
      Authorization: expectedAuth,
    });

    const body = JSON.parse(options.body as string);
    expect(body.fields.project.key).toBe("SRE");
    expect(body.fields.issuetype.name).toBe("Incident");
    expect(body.fields.summary).toBe(
      "[Incident] auth-service database connection failed",
    );
  });

  it("should dispatch multi-channel incident alert to all configured services", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    const project: IProject = {
      _id: new mongoose.Types.ObjectId(),
      name: "Acme Production",
      apiKey: "test_api_key",
      ownerId: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date(),
      plan: "pro",
      subscriptionStatus: "active",
      billingProvider: "none",
      slackWebhookUrl: "https://hooks.slack.com/services/T1/B1/K1",
      discordWebhookUrl: "https://discord.com/api/webhooks/1/2",
      teamsWebhookUrl: "https://outlook.office.com/webhook/t1",
      pagerdutyRoutingKey: "pd_key_1",
      opsgenieApiKey: "ops_key_1",
      jiraHost: "https://jira.acme.com",
      jiraEmail: "bot@acme.com",
      jiraApiToken: "jira_token_1",
      jiraProjectKey: "OPS",
    };

    const results = await dispatchMultiChannelIncidentAlert(
      project,
      "payment-service",
      "prod",
      "inc_999",
      {
        title: "Payment Gateway 504 Gateway Timeout",
        summary: "Spike in timeout errors during card validation",
        rootCause: "Stripe upstream degraded",
        suggestedFix: ["Switch to secondary gateway", "Enable circuit breaker"],
      },
    );

    expect(results.slack).toBe(true);
    expect(results.discord).toBe(true);
    expect(results.teams).toBe(true);
    expect(results.pagerduty).toBe(true);
    expect(results.opsgenie).toBe(true);
    expect(results.jira).toBe(true);
  });
});
