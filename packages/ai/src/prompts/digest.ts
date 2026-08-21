export interface IncidentDigestContext {
  title: string;
  serviceName: string;
  environment: string;
  status: string;
  createdAt: string;
  rootCause: string;
}

import type { AIConfig } from "./incident";

export interface DigestPromptInput {
  projectName: string;
  incidents: IncidentDigestContext[];
  bypassLLM?: boolean;
  aiConfig?: AIConfig;
}

export function generateDigestPrompt(input: DigestPromptInput): string {
  const incidentsSnippet =
    input.incidents.length > 0
      ? input.incidents
          .map(
            (inc) =>
              `- [${inc.createdAt}] Service: ${inc.serviceName} (${inc.environment}) - Status: ${inc.status}\n  Title: ${inc.title}\n  Root Cause: ${inc.rootCause}`,
          )
          .join("\n")
      : "No incidents occurred overnight. Everything was fully operational.";

  return `You are ObservabilityOS, an AI-native SRE intelligence assistant.
Your task is to generate a concise, human-friendly "Morning Executive Summary" for a developer email digest.

Context:
- Project Name: ${input.projectName}
- Overnight Incidents (Last 24 Hours):
${incidentsSnippet}

Instructions:
Generate a short summary (1 to 2 sentences max) describing the overall system health and the key incidents that occurred overnight (if any). Keep the tone professional, conversational, and SRE-focused. Explain the situation clearly in plain English. Avoid repeating the project name if unnecessary.

Format:
Return a raw, plain-text string containing ONLY the summary. Do not output JSON, do not wrap in markdown, do not include any prefixes like "Here is the summary:". Just the summary text.

Summary Output:`;
}
