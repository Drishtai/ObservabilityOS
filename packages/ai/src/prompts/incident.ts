export interface LogContext {
  timestamp: string;
  level: string;
  message: string;
  metadata?: any;
  traceId?: string;
}

export interface DeployContext {
  deployedAt: string;
  commitSha: string;
  commitMessage: string;
  branch: string;
}

export interface HistoricalIncident {
  title: string;
  rootCause: string;
  suggestedFix: string[];
  comments?: string[];
}

export interface AIConfig {
  enabled?: boolean;
  provider?: "system" | "openai" | "anthropic" | "aicredits" | "custom";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  anthropicApiKey?: string;
  anthropicModel?: string;
  openaiApiKey?: string;
  openaiModel?: string;
  openaiBaseUrl?: string;
  aicreditsApiKey?: string;
  aicreditsModel?: string;
  customAiApiKey?: string;
  customAiModel?: string;
  customAiBaseUrl?: string;
  fallbackOrder?: string[];
}

export interface IncidentPromptInput {
  serviceName: string;
  environment: string;
  detectedAt: string;
  anomalyMetric: string; // e.g. "z-score: 4.2" or "spike from 0 to 15 errors"
  logs: LogContext[];
  deploys: DeployContext[];
  historicalIncidents?: HistoricalIncident[];
  bypassLLM?: boolean;
  aiConfig?: AIConfig;
}

export function generateIncidentPrompt(input: IncidentPromptInput): string {
  const logSnippet = input.logs
    .map(
      (l) =>
        `[${l.timestamp}] [${l.level.toUpperCase()}] ${l.message} (Trace ID: ${
          l.traceId || "N/A"
        }) Metadata: ${JSON.stringify(l.metadata || {})}`,
    )
    .join("\n");

  const deploySnippet =
    input.deploys.length > 0
      ? input.deploys
          .map(
            (d) =>
              `- [${d.deployedAt}] Branch: ${d.branch}, Commit: ${d.commitSha.slice(
                0,
                7,
              )}, Message: "${d.commitMessage}"`,
          )
          .join("\n")
      : "No recent deployments detected in the window preceding this anomaly.";

  const historicalSnippet =
    input.historicalIncidents && input.historicalIncidents.length > 0
      ? "\n### Similar Historical Incidents & Resolutions:\n" +
        input.historicalIncidents
          .map(
            (h, idx) =>
              `${idx + 1}. **Title**: ${h.title}\n` +
              `   - **Root Cause**: ${h.rootCause}\n` +
              `   - **Suggested Fixes**: ${h.suggestedFix.join(", ")}\n` +
              (h.comments && h.comments.length > 0
                ? `   - **Developer Comments/Resolution Notes**:\n` +
                  h.comments.map((c) => `     > ${c}`).join("\n")
                : ""),
          )
          .join("\n") +
        "\n"
      : "";

  return `You are ObservabilityOS, an AI-native DevOps and SRE intelligence agent.
You are analyzing a service anomaly in order to generate a structured Incident Report.

### Context:
- **Service Name**: ${input.serviceName}
- **Environment**: ${input.environment}
- **Time of Detection**: ${input.detectedAt}
- **Anomaly Severity Indicator**: ${input.anomalyMetric}

### Recent Deployments (Preceding 30 Minutes):
${deploySnippet}
${historicalSnippet}

### Anomalous Log Snippets:
\`\`\`text
${logSnippet}
\`\`\`

### Instructions:
Analyze the provided log messages and correlate them with any recent deployments. If there are deployment events close to the anomaly time, analyze if the commit message suggests changes that could trigger these errors.

Generate a structured analysis. You MUST output ONLY a valid JSON object matching the schema below. Do not wrap in markdown code blocks like \`\`\`json. Output raw JSON.

### Expected Output JSON Format:
{
  "title": "A concise, developer-friendly incident title summarizing the primary symptom and service (e.g. 'Stripe payment gateway timeout in checkout')",
  "summary": "A high-level explanation of what went wrong, including what symptoms were seen.",
  "rootCause": "A technical, root-cause diagnosis. If a recent deployment is correlated, explain why it might be the cause, referencing the commit. If not, diagnose from the log exceptions.",
  "impact": "What endpoints, customers, or systems are affected based on the logs and metadata.",
  "suggestedFix": [
    "A list of actionable steps for an on-call engineer to troubleshoot and resolve this issue."
  ],
  "confidence": 0.85
}

JSON Output:`;
}
