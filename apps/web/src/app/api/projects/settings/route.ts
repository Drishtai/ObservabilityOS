import { getAuthenticatedUser } from "@/lib/auth";
import { NextResponse } from "next/server";
import { Project } from "@repo/db";
import { z } from "zod";
import { logAuditEvent } from "@/lib/audit";
import { requireProjectPermission } from "@/lib/permissions";

const settingsUpdateSchema = z.object({
  projectId: z.string().min(1, "projectId is required"),
  name: z.string().min(1, "Project name cannot be empty"),
  slackWebhookUrl: z.string().optional().or(z.literal("")),
  discordWebhookUrl: z.string().optional().or(z.literal("")),
  teamsWebhookUrl: z.string().optional().or(z.literal("")),
  pagerdutyRoutingKey: z.string().optional().or(z.literal("")),
  opsgenieApiKey: z.string().optional().or(z.literal("")),
  opsgenieRegion: z.enum(["us", "eu"]).optional(),
  jiraHost: z.string().optional().or(z.literal("")),
  jiraEmail: z.string().optional().or(z.literal("")),
  jiraApiToken: z.string().optional().or(z.literal("")),
  jiraProjectKey: z.string().optional().or(z.literal("")),
  jiraIssueType: z.string().optional().or(z.literal("")),
  aiProvider: z
    .enum(["system", "openai", "anthropic", "aicredits", "custom"])
    .optional(),
  aiApiKey: z.string().optional().or(z.literal("")),
  aiModel: z.string().optional().or(z.literal("")),
  aiBaseUrl: z.string().optional().or(z.literal("")),
  aiEnabled: z.boolean().optional(),
  anthropicApiKey: z.string().optional().or(z.literal("")),
  anthropicModel: z.string().optional().or(z.literal("")),
  openaiApiKey: z.string().optional().or(z.literal("")),
  openaiModel: z.string().optional().or(z.literal("")),
  openaiBaseUrl: z.string().optional().or(z.literal("")),
  aicreditsApiKey: z.string().optional().or(z.literal("")),
  aicreditsModel: z.string().optional().or(z.literal("")),
  customAiApiKey: z.string().optional().or(z.literal("")),
  customAiModel: z.string().optional().or(z.literal("")),
  customAiBaseUrl: z.string().optional().or(z.literal("")),
  aiFallbackOrder: z.array(z.string()).optional(),
  minErrorCount: z
    .number()
    .int()
    .min(1, "Minimum error count must be at least 1"),
  zScoreThreshold: z
    .number()
    .min(1.0, "Z-Score threshold must be at least 1.0"),
});

export async function PATCH(request: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Not logged in" } },
        { status: 401 },
      );
    }

    const rawBody = await request.json();
    const validatedData = settingsUpdateSchema.parse(rawBody);

    const { authorized, project, error } = await requireProjectPermission(
      user._id,
      validatedData.projectId,
      "admin",
    );

    if (!authorized || !project) {
      return NextResponse.json(
        {
          error: error || {
            code: "FORBIDDEN",
            message: "Project not found or access denied",
          },
        },
        { status: error?.status || 403 },
      );
    }

    // Check if webhooks changed
    const slackChanged =
      project.slackWebhookUrl !== (validatedData.slackWebhookUrl?.trim() || "");
    const discordChanged =
      project.discordWebhookUrl !==
      (validatedData.discordWebhookUrl?.trim() || "");
    const teamsChanged =
      project.teamsWebhookUrl !== (validatedData.teamsWebhookUrl?.trim() || "");
    const webhookUpdated = slackChanged || discordChanged || teamsChanged;

    // Check if AI settings changed
    const aiUpdated =
      validatedData.aiProvider !== undefined ||
      validatedData.aiApiKey !== undefined ||
      validatedData.aiModel !== undefined ||
      validatedData.aiBaseUrl !== undefined ||
      validatedData.aiEnabled !== undefined ||
      validatedData.anthropicApiKey !== undefined ||
      validatedData.anthropicModel !== undefined ||
      validatedData.openaiApiKey !== undefined ||
      validatedData.openaiModel !== undefined ||
      validatedData.openaiBaseUrl !== undefined ||
      validatedData.aicreditsApiKey !== undefined ||
      validatedData.aicreditsModel !== undefined ||
      validatedData.customAiApiKey !== undefined ||
      validatedData.customAiModel !== undefined ||
      validatedData.customAiBaseUrl !== undefined ||
      validatedData.aiFallbackOrder !== undefined;

    // Update settings
    project.name = validatedData.name.trim();
    project.slackWebhookUrl = validatedData.slackWebhookUrl?.trim() || "";
    project.discordWebhookUrl = validatedData.discordWebhookUrl?.trim() || "";
    project.teamsWebhookUrl = validatedData.teamsWebhookUrl?.trim() || "";
    project.pagerdutyRoutingKey =
      validatedData.pagerdutyRoutingKey?.trim() || "";
    project.opsgenieApiKey = validatedData.opsgenieApiKey?.trim() || "";
    project.opsgenieRegion = validatedData.opsgenieRegion || "us";
    project.jiraHost = validatedData.jiraHost?.trim() || "";
    project.jiraEmail = validatedData.jiraEmail?.trim() || "";
    project.jiraApiToken = validatedData.jiraApiToken?.trim() || "";
    project.jiraProjectKey = validatedData.jiraProjectKey?.trim() || "";
    project.jiraIssueType = validatedData.jiraIssueType?.trim() || "Bug";
    project.minErrorCount = validatedData.minErrorCount;
    project.zScoreThreshold = validatedData.zScoreThreshold;

    if (validatedData.aiProvider !== undefined) {
      project.aiProvider = validatedData.aiProvider;
    }
    if (
      validatedData.aiApiKey !== undefined &&
      !validatedData.aiApiKey.includes("••••")
    ) {
      project.aiApiKey = validatedData.aiApiKey.trim();
    }
    if (validatedData.aiModel !== undefined) {
      project.aiModel = validatedData.aiModel.trim();
    }
    if (validatedData.aiBaseUrl !== undefined) {
      project.aiBaseUrl = validatedData.aiBaseUrl.trim();
    }
    if (validatedData.aiEnabled !== undefined) {
      project.aiEnabled = validatedData.aiEnabled;
    }

    if (
      validatedData.anthropicApiKey !== undefined &&
      !validatedData.anthropicApiKey.includes("••••")
    ) {
      project.anthropicApiKey = validatedData.anthropicApiKey.trim();
    }
    if (validatedData.anthropicModel !== undefined) {
      project.anthropicModel = validatedData.anthropicModel.trim();
    }

    if (
      validatedData.openaiApiKey !== undefined &&
      !validatedData.openaiApiKey.includes("••••")
    ) {
      project.openaiApiKey = validatedData.openaiApiKey.trim();
    }
    if (validatedData.openaiModel !== undefined) {
      project.openaiModel = validatedData.openaiModel.trim();
    }
    if (validatedData.openaiBaseUrl !== undefined) {
      project.openaiBaseUrl = validatedData.openaiBaseUrl.trim();
    }

    if (
      validatedData.aicreditsApiKey !== undefined &&
      !validatedData.aicreditsApiKey.includes("••••")
    ) {
      project.aicreditsApiKey = validatedData.aicreditsApiKey.trim();
    }
    if (validatedData.aicreditsModel !== undefined) {
      project.aicreditsModel = validatedData.aicreditsModel.trim();
    }

    if (
      validatedData.customAiApiKey !== undefined &&
      !validatedData.customAiApiKey.includes("••••")
    ) {
      project.customAiApiKey = validatedData.customAiApiKey.trim();
    }
    if (validatedData.customAiModel !== undefined) {
      project.customAiModel = validatedData.customAiModel.trim();
    }
    if (validatedData.customAiBaseUrl !== undefined) {
      project.customAiBaseUrl = validatedData.customAiBaseUrl.trim();
    }
    if (validatedData.aiFallbackOrder !== undefined) {
      project.aiFallbackOrder = validatedData.aiFallbackOrder;
    }

    await project.save();

    if (webhookUpdated) {
      await logAuditEvent({
        projectId: project._id.toString(),
        userId: user._id.toString(),
        action: "webhook.update",
        targetEntity: "webhook",
        targetId: project._id.toString(),
        metadata: {
          slackChanged,
          discordChanged,
          teamsChanged,
        },
      });
    }

    if (aiUpdated) {
      await logAuditEvent({
        projectId: project._id.toString(),
        userId: user._id.toString(),
        action: "ai.update",
        targetEntity: "project",
        targetId: project._id.toString(),
        metadata: {
          aiEnabled: project.aiEnabled,
          aiFallbackOrder: project.aiFallbackOrder,
        },
      });
    }

    const maskKey = (k?: string) =>
      k ? `${k.slice(0, 4)}••••••••${k.slice(-4)}` : "";

    return NextResponse.json({
      success: true,
      project: {
        id: project._id.toString(),
        name: project.name,
        apiKey: project.apiKey,
        slackWebhookUrl: project.slackWebhookUrl,
        discordWebhookUrl: project.discordWebhookUrl,
        teamsWebhookUrl: project.teamsWebhookUrl,
        pagerdutyRoutingKey: project.pagerdutyRoutingKey,
        opsgenieApiKey: project.opsgenieApiKey,
        opsgenieRegion: project.opsgenieRegion,
        jiraHost: project.jiraHost,
        jiraEmail: project.jiraEmail,
        jiraApiToken: project.jiraApiToken,
        jiraProjectKey: project.jiraProjectKey,
        jiraIssueType: project.jiraIssueType,
        minErrorCount: project.minErrorCount,
        zScoreThreshold: project.zScoreThreshold,
        aiEnabled: project.aiEnabled ?? true,
        aiProvider: project.aiProvider || "system",
        aiApiKey: maskKey(project.aiApiKey),
        aiModel: project.aiModel || "",
        aiBaseUrl: project.aiBaseUrl || "",
        anthropicApiKey: maskKey(project.anthropicApiKey),
        anthropicModel: project.anthropicModel || "",
        hasAnthropicKey: !!project.anthropicApiKey,
        openaiApiKey: maskKey(project.openaiApiKey),
        openaiModel: project.openaiModel || "",
        openaiBaseUrl: project.openaiBaseUrl || "",
        hasOpenaiKey: !!project.openaiApiKey,
        aicreditsApiKey: maskKey(project.aicreditsApiKey),
        aicreditsModel: project.aicreditsModel || "",
        hasAicreditsKey: !!project.aicreditsApiKey,
        customAiApiKey: maskKey(project.customAiApiKey),
        customAiModel: project.customAiModel || "",
        customAiBaseUrl: project.customAiBaseUrl || "",
        hasCustomAiKey: !!project.customAiApiKey,
        aiFallbackOrder: project.aiFallbackOrder || [
          "anthropic",
          "openai",
          "aicredits",
          "custom",
        ],
      },
    });
  } catch (error) {
    console.error("Project settings PATCH Error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message:
              "Validation failed: " +
              error.errors.map((e) => e.message).join(", "),
          },
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update project settings",
        },
      },
      { status: 500 },
    );
  }
}
