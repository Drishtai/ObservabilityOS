import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth-cache";
import SettingsView from "./SettingsView";

interface PageProps {
  searchParams: Promise<{ projectId?: string }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const { projects } = await getAuthSession();
  const resolvedSearchParams = await searchParams;

  if (projects.length === 0) {
    redirect("/dashboard");
  }

  const activeProjectId =
    resolvedSearchParams.projectId || projects[0]?._id.toString();
  const activeProject =
    projects.find((p) => p._id.toString() === activeProjectId) || projects[0];

  if (!activeProject) {
    redirect("/dashboard");
  }

  const serializedProject = {
    id: activeProject._id.toString(),
    name: activeProject.name,
    apiKey: activeProject.apiKey,
    slackWebhookUrl: activeProject.slackWebhookUrl || "",
    discordWebhookUrl: activeProject.discordWebhookUrl || "",
    teamsWebhookUrl: activeProject.teamsWebhookUrl || "",
    pagerdutyRoutingKey: activeProject.pagerdutyRoutingKey || "",
    opsgenieApiKey: activeProject.opsgenieApiKey || "",
    opsgenieRegion: activeProject.opsgenieRegion || "us",
    jiraHost: activeProject.jiraHost || "",
    jiraEmail: activeProject.jiraEmail || "",
    jiraApiToken: activeProject.jiraApiToken || "",
    jiraProjectKey: activeProject.jiraProjectKey || "",
    jiraIssueType: activeProject.jiraIssueType || "Bug",
    minErrorCount: activeProject.minErrorCount ?? 3,
    zScoreThreshold: activeProject.zScoreThreshold ?? 3.0,
    aiProvider: activeProject.aiProvider || "system",
    aiApiKey: activeProject.aiApiKey
      ? `${activeProject.aiApiKey.slice(0, 4)}••••••••${activeProject.aiApiKey.slice(-4)}`
      : "",
    aiModel: activeProject.aiModel || "",
    aiBaseUrl: activeProject.aiBaseUrl || "",
    aiEnabled: activeProject.aiEnabled ?? true,
    anthropicApiKey: activeProject.anthropicApiKey
      ? `${activeProject.anthropicApiKey.slice(0, 4)}••••••••${activeProject.anthropicApiKey.slice(-4)}`
      : "",
    anthropicModel: activeProject.anthropicModel || "",
    openaiApiKey: activeProject.openaiApiKey
      ? `${activeProject.openaiApiKey.slice(0, 4)}••••••••${activeProject.openaiApiKey.slice(-4)}`
      : "",
    openaiModel: activeProject.openaiModel || "",
    openaiBaseUrl: activeProject.openaiBaseUrl || "",
    aicreditsApiKey: activeProject.aicreditsApiKey
      ? `${activeProject.aicreditsApiKey.slice(0, 4)}••••••••${activeProject.aicreditsApiKey.slice(-4)}`
      : "",
    aicreditsModel: activeProject.aicreditsModel || "",
    customAiApiKey: activeProject.customAiApiKey
      ? `${activeProject.customAiApiKey.slice(0, 4)}••••••••${activeProject.customAiApiKey.slice(-4)}`
      : "",
    customAiModel: activeProject.customAiModel || "",
    customAiBaseUrl: activeProject.customAiBaseUrl || "",
    aiFallbackOrder: activeProject.aiFallbackOrder || [
      "anthropic",
      "openai",
      "aicredits",
      "custom",
    ],
  };

  return <SettingsView project={serializedProject} />;
}
