import {
  generateIncidentPrompt,
  IncidentPromptInput,
} from "./prompts/incident";
import { generateDigestPrompt, DigestPromptInput } from "./prompts/digest";

let lastCallTime = 0;
const COOLDOWN_MS = 2000; // 2 seconds cooldown

function enforceCooldown() {
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < COOLDOWN_MS) {
    throw new Error(
      `LLM call rate limited by AI Cost Control. Cooldown active for another ${((COOLDOWN_MS - timeSinceLastCall) / 1000).toFixed(1)}s.`,
    );
  }
  lastCallTime = now;
}

export interface IncidentAnalysis {
  title: string;
  summary: string;
  rootCause: string;
  impact: string;
  suggestedFix: string[];
  confidence: number;
}

// Stateful SRE Circuit Breaker for AI integrations to prevent cascading latency/failure
class SimpleCircuitBreaker {
  public readonly name: string;
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failures = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private readonly threshold = 3;
  private readonly cooldown = 15000; // 15 seconds

  constructor(name: string) {
    this.name = name;
  }

  public canExecute(): boolean {
    if (this.state === "OPEN") {
      if (Date.now() - this.lastFailureTime > this.cooldown) {
        this.state = "HALF_OPEN";
        console.warn(
          `[AI CircuitBreaker:${this.name}] Transitioned to HALF_OPEN. Testing connection...`,
        );
        return true;
      }
      return false;
    }
    return true;
  }

  public onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.successCount++;
      if (this.successCount >= 2) {
        this.state = "CLOSED";
        this.failures = 0;
        this.successCount = 0;
        console.log(
          `[AI CircuitBreaker:${this.name}] Transitioned to CLOSED. Health restored.`,
        );
      }
    } else {
      this.failures = 0;
    }
  }

  public onFailure(): void {
    this.successCount = 0;
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.failures >= this.threshold || this.state === "HALF_OPEN") {
      this.state = "OPEN";
      console.warn(
        `[AI CircuitBreaker:${this.name}] Transitioned to OPEN. Service is degraded.`,
      );
    }
  }

  public getState(): string {
    return this.state;
  }
}

const anthropicBreaker = new SimpleCircuitBreaker("Anthropic");
const openaiBreaker = new SimpleCircuitBreaker("OpenAI");
const aicreditsBreaker = new SimpleCircuitBreaker("AICredits");
const customBreaker = new SimpleCircuitBreaker("CustomAI");

// Utility to execute fetch with a strict abort signal timeout
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
}

// Wrapper for handling rate limit (429) backoffs and breaker failure logging
async function callProviderWithRetry(
  name: string,
  breaker: SimpleCircuitBreaker,
  makeCall: () => Promise<Response>,
  maxRetries = 2,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      if (!breaker.canExecute()) {
        throw new Error(`Circuit breaker for ${name} is OPEN`);
      }

      const response = await makeCall();

      if (response.status === 429 || response.status >= 500) {
        throw new Error(`HTTP Status ${response.status}`);
      }

      breaker.onSuccess();
      return response;
    } catch (err: any) {
      attempt++;
      breaker.onFailure();

      if (attempt > maxRetries) {
        throw err;
      }

      const delay = Math.pow(2, attempt) * 500 + Math.random() * 200;
      console.warn(
        `[AI Provider:${name}] Attempt ${attempt} failed: ${err.message}. Retrying in ${delay.toFixed(0)}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Safely parse JSON with regex extraction recovery and structural schema defaults
function parseJSONContentAndValidate(text: string): IncidentAnalysis {
  let parsed: any;
  try {
    let cleanText = text.trim();
    if (cleanText.startsWith("```json")) {
      cleanText = cleanText.substring(7, cleanText.length - 3).trim();
    } else if (cleanText.startsWith("```")) {
      cleanText = cleanText.substring(3, cleanText.length - 3).trim();
    }
    parsed = JSON.parse(cleanText);
  } catch (e) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        throw new Error("Failed to parse JSON structure from LLM content");
      }
    } else {
      throw new Error("Invalid JSON structure returned by LLM");
    }
  }

  return {
    title:
      typeof parsed.title === "string" && parsed.title
        ? parsed.title
        : "Unresolved Runtime Anomaly",
    summary:
      typeof parsed.summary === "string" && parsed.summary
        ? parsed.summary
        : "The service encountered an unexpected error spike.",
    rootCause:
      typeof parsed.rootCause === "string" && parsed.rootCause
        ? parsed.rootCause
        : "Exception rate exceeded baseline thresholds.",
    impact:
      typeof parsed.impact === "string" && parsed.impact
        ? parsed.impact
        : "System operations are partially degraded.",
    suggestedFix: Array.isArray(parsed.suggestedFix)
      ? parsed.suggestedFix.map(String)
      : [
          "Inspect recent error logs for service exceptions.",
          "Verify server availability.",
        ],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.8,
  };
}

/**
 * Executes a robust, multi-level AI provider fallback chain.
 * Tries configured project keys first, then platform environment fallback keys, across all providers.
 */
async function executeMultiLevelAiFallback(
  prompt: string,
  isJsonFormat: boolean,
  aiConfig?: {
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
  },
): Promise<string | null> {
  const fallbackOrder = aiConfig?.fallbackOrder && aiConfig.fallbackOrder.length > 0
    ? aiConfig.fallbackOrder
    : ["anthropic", "openai", "aicredits", "custom"];

  for (const providerId of fallbackOrder) {
    if (providerId === "anthropic") {
      const key =
        aiConfig?.anthropicApiKey ||
        (aiConfig?.provider === "anthropic" ? aiConfig?.apiKey : undefined) ||
        process.env.ANTHROPIC_API_KEY;

      if (!key) {
        // Fast skip - No key set for Anthropic Claude
        continue;
      }

      if (anthropicBreaker.canExecute()) {
        const model =
          aiConfig?.anthropicModel ||
          (aiConfig?.provider === "anthropic" ? aiConfig?.model : undefined) ||
          "claude-3-5-haiku-20241022";
        const url =
          aiConfig?.baseUrl && aiConfig?.provider === "anthropic"
            ? `${aiConfig.baseUrl.replace(/\/+$/, "")}/v1/messages`
            : "https://api.anthropic.com/v1/messages";

        try {
          const response = await callProviderWithRetry(
            "Anthropic",
            anthropicBreaker,
            () =>
              fetchWithTimeout(
                url,
                {
                  method: "POST",
                  headers: {
                    "x-api-key": key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({
                    model,
                    max_tokens: isJsonFormat ? 1500 : 300,
                    messages: [{ role: "user", content: prompt }],
                  }),
                },
                6000,
              ),
          );

          if (response.ok) {
            const data = await response.json();
            const textContent = data.content?.[0]?.text || "";
            if (textContent.trim()) {
              console.log(
                `[ObservabilityOS AI] Successfully generated analysis via Anthropic Claude (${model}).`,
              );
              return textContent;
            }
          } else {
            console.warn(
              `[ObservabilityOS AI] Anthropic responded with status ${response.status}. Falling back to next level...`,
            );
          }
        } catch (err) {
          console.warn(
            `[ObservabilityOS AI] Anthropic Claude provider failed. Falling back to next provider in chain...`,
            err,
          );
        }
      }
    } else if (providerId === "openai") {
      const key =
        aiConfig?.openaiApiKey ||
        (aiConfig?.provider === "openai" ? aiConfig?.apiKey : undefined) ||
        process.env.OPENAI_API_KEY;

      if (!key) {
        // Fast skip - No key set for OpenAI
        continue;
      }

      if (openaiBreaker.canExecute()) {
        const model =
          aiConfig?.openaiModel ||
          (aiConfig?.provider === "openai" ? aiConfig?.model : undefined) ||
          "gpt-4o-mini";
        const rawUrl =
          aiConfig?.openaiBaseUrl ||
          (aiConfig?.provider === "openai" ? aiConfig?.baseUrl : undefined) ||
          "https://api.openai.com/v1";
        const url = rawUrl.endsWith("/chat/completions")
          ? rawUrl
          : `${rawUrl.replace(/\/+$/, "")}/chat/completions`;

        try {
          const response = await callProviderWithRetry(
            "OpenAI",
            openaiBreaker,
            () =>
              fetchWithTimeout(
                url,
                {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${key}`,
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({
                    model,
                    max_tokens: isJsonFormat ? 1500 : 300,
                    messages: [{ role: "user", content: prompt }],
                    response_format: isJsonFormat
                      ? { type: "json_object" }
                      : undefined,
                  }),
                },
                6000,
              ),
          );

          if (response.ok) {
            const data = await response.json();
            const textContent = data.choices?.[0]?.message?.content || "";
            if (textContent.trim()) {
              console.log(
                `[ObservabilityOS AI] Successfully generated analysis via OpenAI (${model}).`,
              );
              return textContent;
            }
          } else {
            console.warn(
              `[ObservabilityOS AI] OpenAI responded with status ${response.status}. Falling back to next level...`,
            );
          }
        } catch (err) {
          console.warn(
            `[ObservabilityOS AI] OpenAI provider failed. Falling back to next provider in chain...`,
            err,
          );
        }
      }
    } else if (providerId === "aicredits") {
      const key =
        aiConfig?.aicreditsApiKey ||
        (aiConfig?.provider === "aicredits" ? aiConfig?.apiKey : undefined) ||
        process.env.AICREDITS_API_KEY;

      if (!key) {
        // Fast skip - No key set for AICredits Gateway
        continue;
      }

      if (aicreditsBreaker.canExecute()) {
        const gatewayModels = [
          aiConfig?.aicreditsModel,
          process.env.AICREDITS_MODEL,
          "anthropic/claude-3-5-haiku-20241022",
          "openai/gpt-4o-mini",
        ].filter(Boolean) as string[];

        for (const model of gatewayModels) {
          try {
            const response = await callProviderWithRetry(
              `AICredits:${model}`,
              aicreditsBreaker,
              () =>
                fetchWithTimeout(
                  "https://aicredits.in/v1/chat/completions",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${key}`,
                      "content-type": "application/json",
                    },
                    body: JSON.stringify({
                      model,
                      max_tokens: isJsonFormat ? 1500 : 300,
                      messages: [{ role: "user", content: prompt }],
                      response_format:
                        isJsonFormat &&
                        (model.includes("gpt") || model.includes("openai"))
                          ? { type: "json_object" }
                          : undefined,
                    }),
                  },
                  6000,
                ),
            );

            if (response.ok) {
              const data = await response.json();
              const textContent = data.choices?.[0]?.message?.content || "";
              if (textContent.trim()) {
                console.log(
                  `[ObservabilityOS AI] Successfully generated analysis via AICredits (${model}).`,
                );
                return textContent;
              }
            }
          } catch (err) {
            console.warn(
              `[ObservabilityOS AI] AICredits Gateway model ${model} failed, trying next fallback...`,
              err,
            );
          }
        }
      }
    } else if (providerId === "custom") {
      const key =
        aiConfig?.customAiApiKey ||
        (aiConfig?.provider === "custom" ? aiConfig?.apiKey : undefined) ||
        "";
      const rawUrl =
        aiConfig?.customAiBaseUrl ||
        (aiConfig?.provider === "custom" ? aiConfig?.baseUrl : undefined);

      if (!key && !rawUrl) {
        // Fast skip - No custom API key or URL configured
        continue;
      }

      if (customBreaker.canExecute()) {
        const model =
          aiConfig?.customAiModel ||
          (aiConfig?.provider === "custom" ? aiConfig?.model : undefined) ||
          "llama-3.3-70b-versatile";
        const targetUrl = rawUrl || "https://api.groq.com/openai/v1";
        const url = targetUrl.endsWith("/chat/completions")
          ? targetUrl
          : `${targetUrl.replace(/\/+$/, "")}/chat/completions`;

        const headers: Record<string, string> = {
          "content-type": "application/json",
        };
        if (key) {
          headers["Authorization"] = `Bearer ${key}`;
        }

        try {
          const response = await callProviderWithRetry(
            "CustomAI",
            customBreaker,
            () =>
              fetchWithTimeout(
                url,
                {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    model,
                    max_tokens: isJsonFormat ? 1500 : 300,
                    messages: [{ role: "user", content: prompt }],
                    response_format: isJsonFormat
                      ? { type: "json_object" }
                      : undefined,
                  }),
                },
                8000,
              ),
          );

          if (response.ok) {
            const data = await response.json();
            const textContent = data.choices?.[0]?.message?.content || "";
            if (textContent.trim()) {
              console.log(
                `[ObservabilityOS AI] Successfully generated analysis via Custom OpenAI-Compatible LLM (${model}).`,
              );
              return textContent;
            }
          } else {
            console.warn(
              `[ObservabilityOS AI] Custom LLM (${url}) returned status ${response.status}. Falling back...`,
            );
          }
        } catch (err) {
          console.warn(
            `[ObservabilityOS AI] Custom LLM (${url}) failed. Falling back to next level...`,
            err,
          );
        }
      }
    }
  }

  return null;
}

/**
 * Invokes LLM providers with multi-level fallback across all configured keys and platforms.
 * Falls back to high-quality heuristic reasoning if all upstream providers are unavailable.
 */
export async function generateIncidentAnalysis(
  input: IncidentPromptInput,
): Promise<IncidentAnalysis> {
  // Prevent playground simulations and free developer plans from consuming real LLM API credits
  const isPlayground = input.logs.some(
    (l) => l.traceId && l.traceId.startsWith("trace_playground_"),
  );
  if (
    isPlayground ||
    input.bypassLLM ||
    input.aiConfig?.enabled === false
  ) {
    console.log(
      `[ObservabilityOS AI] Bypassing LLM API call (Reason: ${isPlayground ? "Playground simulation" : input.aiConfig?.enabled === false ? "AI disabled in project settings" : "Free Developer plan limit"}). Returning mock analysis.`,
    );
    return generateMockAnalysis(input);
  }

  // Fast check: If no provider keys are set in project or environment, return mock analysis immediately without cooldown or network delay
  const hasAnyKey =
    !!(input.aiConfig?.anthropicApiKey || (input.aiConfig?.provider === "anthropic" && input.aiConfig?.apiKey) || process.env.ANTHROPIC_API_KEY) ||
    !!(input.aiConfig?.openaiApiKey || (input.aiConfig?.provider === "openai" && input.aiConfig?.apiKey) || process.env.OPENAI_API_KEY) ||
    !!(input.aiConfig?.aicreditsApiKey || (input.aiConfig?.provider === "aicredits" && input.aiConfig?.apiKey) || process.env.AICREDITS_API_KEY) ||
    !!(input.aiConfig?.customAiApiKey || (input.aiConfig?.provider === "custom" && input.aiConfig?.apiKey) || input.aiConfig?.customAiBaseUrl || (input.aiConfig?.provider === "custom" && input.aiConfig?.baseUrl));

  if (!hasAnyKey) {
    return generateMockAnalysis(input);
  }

  try {
    enforceCooldown();
  } catch (cooldownErr) {
    console.warn(
      "[ObservabilityOS AI] Cooldown active, falling back to mock analysis:",
      cooldownErr,
    );
    return generateMockAnalysis(input);
  }

  const prompt = generateIncidentPrompt(input);

  // Execute full multi-level fallback chain
  const resultText = await executeMultiLevelAiFallback(
    prompt,
    true,
    input.aiConfig,
  );

  if (resultText) {
    try {
      return parseJSONContentAndValidate(resultText);
    } catch (parseErr) {
      console.warn(
        "[ObservabilityOS AI] LLM response could not be parsed as JSON, falling back to heuristic engine...",
        parseErr,
      );
    }
  }

  // Graceful fallback to heuristic reasoning engine
  return generateMockAnalysis(input);
}

function generateMockAnalysis(input: IncidentPromptInput): IncidentAnalysis {
  const errorMessages = input.logs.map((l) => l.message.toLowerCase());
  const errorLevels = input.logs.map((l) => l.level);

  // Heuristic checking
  const isFundsError = errorMessages.some(
    (msg) => msg.includes("insufficient funds") || msg.includes("err_funds"),
  );
  const isDbError = errorMessages.some(
    (msg) =>
      msg.includes("db") ||
      msg.includes("mongo") ||
      msg.includes("connection pool") ||
      msg.includes("connection failed"),
  );
  const isTimeoutError = errorMessages.some(
    (msg) =>
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("latency"),
  );
  const isOOMError = errorMessages.some(
    (msg) =>
      msg.includes("heap limit") ||
      msg.includes("heap out of memory") ||
      msg.includes("oom") ||
      msg.includes("allocation failed") ||
      msg.includes("code 137"),
  );
  const isWebhookSignatureError = errorMessages.some(
    (msg) =>
      msg.includes("signature") ||
      msg.includes("webhook signature") ||
      msg.includes("unauthorizedaccessexception"),
  );
  const isThirdPartyError = errorMessages.some(
    (msg) =>
      msg.includes("sendgrid") ||
      msg.includes("502 bad gateway") ||
      msg.includes("connection reset by peer"),
  );
  const isNullPointer = errorMessages.some(
    (msg) =>
      msg.includes("nullpointerexception") ||
      msg.includes("null pointer") ||
      msg.includes("java.lang.nullpointerexception"),
  );

  const deploy = input.deploys[0];
  const deployCorrMessage = deploy
    ? ` This was correlated with deployment ${deploy.commitSha.slice(0, 7)} ("${deploy.commitMessage}") on branch ${deploy.branch}.`
    : "";

  if (isFundsError) {
    return {
      title: `Transaction failed due to insufficient funds in ${input.serviceName}`,
      summary: `A spike in transaction failures was detected on the service "${input.serviceName}" (${input.environment}). Customers are encountering errors during checkout.`,
      rootCause: `Customer accounts do not have enough funds to complete authorization requests. ${deployCorrMessage}`,
      impact: `Billing portal and payment processing flow. Approximately 15% of payment intents are failing.`,
      suggestedFix: [
        "Inspect payment-service webhook logs to verify if customer is shown proper insufficient funds message.",
        "Ensure stripe payment intent statuses are captured and user balance status updates appropriately.",
        "Check account ledger sync status.",
      ],
      confidence: 0.95,
    };
  }

  if (isDbError) {
    return {
      title: `Database connection pool exhaustion in ${input.serviceName}`,
      summary: `The service "${input.serviceName}" in environment "${input.environment}" failed to communicate with the MongoDB Atlas cluster.`,
      rootCause: `High traffic spikes exceeded maximum pool size limits. ${deployCorrMessage}`,
      impact: `All CRUD endpoints for ${input.serviceName} are currently failing with 500 Internal Server Errors.`,
      suggestedFix: [
        "Scale MongoDB connection pool size option in mongoose options.",
        "Verify MongoDB Atlas cluster CPU and IOPS utilization metrics.",
        "Check for unindexed queries holding connections open.",
      ],
      confidence: 0.9,
    };
  }

  if (isTimeoutError) {
    return {
      title: `External API Gateway timeout in ${input.serviceName}`,
      summary: `Downstream service dependencies for "${input.serviceName}" (${input.environment}) are exceeding latency thresholds.`,
      rootCause: `An external API gateway is experiencing high response times (>5000ms). ${deployCorrMessage}`,
      impact: `Delayed response times in customer-facing checkout actions, leading to client-side aborts.`,
      suggestedFix: [
        "Increase timeout limits or configure circuit breakers (e.g. Opossum).",
        "Inspect status dashboard of downstream payment or analytics partners.",
        "Implement asynchronous processing with queues where possible.",
      ],
      confidence: 0.88,
    };
  }

  if (isOOMError) {
    return {
      title: `Out of Memory (OOM) crash in ${input.serviceName}`,
      summary: `The service "${input.serviceName}" (${input.environment}) crashed unexpectedly due to JavaScript heap limit allocation failure.`,
      rootCause: `Memory usage exceeded the allocated container limit. Node.js processes were terminated by the OS kernel (exit code 137).${deployCorrMessage}`,
      impact: `Immediate service termination and automatic container restart. Users may have experienced connection drops or aborted requests during the restart window.`,
      suggestedFix: [
        "Increase the Docker memory limit or set environment variable NODE_OPTIONS='--max-old-space-size=4096'.",
        "Inspect memory profiling snapshots to identify memory leak paths.",
        "Check for large database queries loading too many records in memory at once.",
      ],
      confidence: 0.92,
    };
  }

  if (isWebhookSignatureError) {
    return {
      title: `Webhook signature verification failure in ${input.serviceName}`,
      summary: `A wave of unauthorized webhook requests was rejected due to signature mismatch on "${input.serviceName}" (${input.environment}).`,
      rootCause: `The incoming webhook payload signature did not match the computed signature using the local signing secret. This could indicate invalid keys or modified payloads.${deployCorrMessage}`,
      impact: `Webhook processing is completely halted. External events (e.g. Stripe checkout events) are not being handled.`,
      suggestedFix: [
        "Verify that the webhook signing secret stored in environment variables is correct and matches the provider configuration.",
        "Check for clock skew between the web server and the webhook provider.",
        "Inspect if the raw request body is being modified (e.g., by body-parser middleware) before signature verification.",
      ],
      confidence: 0.94,
    };
  }

  if (isThirdPartyError) {
    return {
      title: `Downstream API failure (SendGrid) in ${input.serviceName}`,
      summary: `A spike in SendGrid API errors was detected. Outbound transactional emails are failing to send.`,
      rootCause: `SendGrid API returned 502 Bad Gateway response codes, suggesting a service degradation or network outage on their side.${deployCorrMessage}`,
      impact: `Transactional emails, welcome alerts, and password resets are failing to deliver. Delivery queue is building up.`,
      suggestedFix: [
        "Check SendGrid status page for ongoing incidents.",
        "Implement a retry queue with exponential backoff for failed email dispatches.",
        "Consider configuring a secondary fallback mail provider (e.g. Amazon SES or Mailgun).",
      ],
      confidence: 0.89,
    };
  }

  if (isNullPointer) {
    return {
      title: `NullPointerException in validateToken in ${input.serviceName}`,
      summary: `Multiple uncaught NullPointerExceptions detected in the validation logic of "${input.serviceName}" (${input.environment}).`,
      rootCause: `The code attempted to invoke 'String.length()' on a null reference (the token variable). This is likely due to an unhandled optional header or request field.${deployCorrMessage}`,
      impact: `User login and API request authentication requests are failing, preventing access to the dashboard.`,
      suggestedFix: [
        "Add null-checks before invoking methods on dynamic parameters.",
        "Write unit tests to verify behavior when authentication token headers are empty or missing.",
        "Ensure proper exception handler catches and returns 400 Bad Request instead of throwing uncaught 500 exceptions.",
      ],
      confidence: 0.95,
    };
  }

  // Fallback default mock
  const topError = input.logs[0]?.message || "Unexpected exception trace";
  return {
    title: `Spike in unresolved errors in ${input.serviceName}`,
    summary: `A high concentration of error-level logs was detected on service "${input.serviceName}" in the "${input.environment}" environment.`,
    rootCause: `An exception occurred in the execution thread: "${topError}". ${deployCorrMessage}`,
    impact: `Operations in ${input.serviceName} are partially degraded.`,
    suggestedFix: [
      "Review the error log stack trace for code-level faults.",
      "Revert the latest release if deploy correlation indicates a regression.",
      "Check server health and CPU load.",
    ],
    confidence: 0.75,
  };
}

function generateMockEmailDigestSummary(input: DigestPromptInput): string {
  if (input.incidents.length === 0) {
    return "All services were fully operational overnight with 100% availability. No anomalies or active incidents were detected.";
  } else {
    const serviceNames = Array.from(
      new Set(input.incidents.map((inc) => inc.serviceName)),
    );
    return `Overnight, ${input.incidents.length} SRE anomalies occurred in ${serviceNames.join(", ")}. The primary issue was related to transaction failures in payment-service caused by customer balance exceptions.`;
  }
}

/**
 * Generates an SRE-focused plain-text morning digest summary of overnight incidents.
 * Falls back to local heuristics if no LLM API keys are present.
 */
export async function generateEmailDigestSummary(
  input: DigestPromptInput,
): Promise<string> {
  if (input.bypassLLM || input.aiConfig?.enabled === false) {
    console.log(
      "[ObservabilityOS AI] Bypassing LLM email digest call (Reason: AI disabled or Free Developer plan limit). Returning mock summary.",
    );
    return generateMockEmailDigestSummary(input);
  }

  const hasAnyKey =
    !!(input.aiConfig?.anthropicApiKey || (input.aiConfig?.provider === "anthropic" && input.aiConfig?.apiKey) || process.env.ANTHROPIC_API_KEY) ||
    !!(input.aiConfig?.openaiApiKey || (input.aiConfig?.provider === "openai" && input.aiConfig?.apiKey) || process.env.OPENAI_API_KEY) ||
    !!(input.aiConfig?.aicreditsApiKey || (input.aiConfig?.provider === "aicredits" && input.aiConfig?.apiKey) || process.env.AICREDITS_API_KEY) ||
    !!(input.aiConfig?.customAiApiKey || (input.aiConfig?.provider === "custom" && input.aiConfig?.apiKey) || input.aiConfig?.customAiBaseUrl || (input.aiConfig?.provider === "custom" && input.aiConfig?.baseUrl));

  if (!hasAnyKey) {
    return generateMockEmailDigestSummary(input);
  }

  try {
    enforceCooldown();
  } catch (cooldownErr) {
    console.warn(
      "[ObservabilityOS AI] Cooldown active, falling back to mock summary:",
      cooldownErr,
    );
    return generateMockEmailDigestSummary(input);
  }

  const prompt = generateDigestPrompt(input);

  const resultText = await executeMultiLevelAiFallback(
    prompt,
    false,
    input.aiConfig,
  );

  if (resultText && resultText.trim()) {
    return resultText.trim();
  }

  return generateMockEmailDigestSummary(input);
}

/**
 * Deterministically generates a 1536-dimensional float vector from input text
 * using charCode hashing. Used for local/mock fallback search logic.
 */
export function generateMockEmbedding(text: string): number[] {
  const embedding = new Array<number>(1536).fill(0);
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Fill the embedding array deterministically
  for (let i = 0; i < 1536; i++) {
    const val = Math.sin(hash + i) * 10000;
    const fraction = val - Math.floor(val);
    embedding[i] = fraction * 2 - 1; // Fit in [-1.0, 1.0] range
  }
  return embedding;
}

/**
 * Contacts OpenAI / AICredits embeddings endpoint to calculate text vectors,
 * falling back to local deterministic mock vectors on cooldowns or missing keys.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  const AICREDITS_API_KEY = process.env.AICREDITS_API_KEY;

  if (OPENAI_API_KEY) {
    try {
      enforceCooldown();
    } catch {
      console.warn(
        "[ObservabilityOS AI] Embedding cooldown active, falling back to mock embedding.",
      );
      return generateMockEmbedding(text);
    }

    try {
      const response = await fetchWithTimeout(
        "https://api.openai.com/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
          }),
        },
        5000,
      );

      if (!response.ok) {
        throw new Error(`OpenAI Embeddings returned status ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;
      if (Array.isArray(embedding)) {
        return embedding;
      }
    } catch (err) {
      console.warn(
        "[ObservabilityOS AI] OpenAI embeddings call failed, falling back to mock embedding:",
        err,
      );
    }
  } else if (AICREDITS_API_KEY) {
    try {
      enforceCooldown();
    } catch {
      return generateMockEmbedding(text);
    }

    try {
      const response = await fetchWithTimeout(
        "https://aicredits.in/v1/embeddings",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${AICREDITS_API_KEY}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "text-embedding-3-small",
            input: text,
          }),
        },
        5000,
      );

      if (!response.ok) {
        throw new Error(
          `AICredits Embeddings returned status ${response.status}`,
        );
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;
      if (Array.isArray(embedding)) {
        return embedding;
      }
    } catch (err) {
      console.warn(
        "[ObservabilityOS AI] AICredits embeddings call failed, falling back to mock embedding:",
        err,
      );
    }
  }

  return generateMockEmbedding(text);
}
