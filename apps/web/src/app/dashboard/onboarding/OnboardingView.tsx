"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Rocket,
  Terminal,
  Code,
  Check,
  Copy,
  RefreshCw,
  Volume2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface OnboardingService {
  id: string;
  name: string;
  environment: string;
}

interface OnboardingViewProps {
  project: {
    id: string;
    name: string;
    apiKey: string;
    slackWebhookUrl: string;
    discordWebhookUrl: string;
    teamsWebhookUrl: string;
  };
}

export default function OnboardingView({ project }: OnboardingViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plainApiKey = searchParams.get("apiKey");
  const displayApiKey = plainApiKey || "obs_sk_••••••••••••••••";

  const [step, setStep] = useState(1);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState(
    project.slackWebhookUrl || "",
  );
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
    project.discordWebhookUrl || "",
  );
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState(
    project.teamsWebhookUrl || "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // SLO Config state
  const [enableAvailSlo, setEnableAvailSlo] = useState(true);
  const [availSloTarget, setAvailSloTarget] = useState(99.0);
  const [availSloWindow, setAvailSloWindow] = useState(30);

  const [enableLatencySlo, setEnableLatencySlo] = useState(true);
  const [latencySloTarget, setLatencySloTarget] = useState(95.0);
  const [latencySloThreshold, setLatencySloThreshold] = useState(500);
  const [latencySloWindow, setLatencySloWindow] = useState(30);

  const [services, setServices] = useState<OnboardingService[]>([]);
  const [isLoadingServices, setIsLoadingServices] = useState(false);
  const [isSavingSlos, setIsSavingSlos] = useState(false);

  // Ingestion tracking states
  const [isIngested, setIsIngested] = useState(false);
  const [ingestionCount, setIngestionCount] = useState(0);
  const [pollingStatus, setPollingStatus] = useState<
    "idle" | "polling" | "success" | "error"
  >("idle");
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [prevStep, setPrevStep] = useState(step);
  if (step !== prevStep) {
    setPrevStep(step);
    if (step === 4) {
      setPollingStatus("polling");
    } else {
      setPollingStatus("idle");
    }
    if (step === 5 && services.length === 0) {
      setIsLoadingServices(true);
    }
  }

  const endpointUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/ingest`
      : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ingest`;

  const installCmd = "npm install @observability-os/sdk";
  const sdkIntegrationSnippet = `import { Logger } from "@observability-os/sdk";

const logger = new Logger({
  apiKey: "${displayApiKey}",
  endpoint: "${endpointUrl}",
  defaultService: "main-api",
  defaultEnvironment: "staging"
});

// Ship your first log stream
logger.info("ObservabilityOS integration successful!", {
  metadata: { version: "1.0.0" }
});`;

  // Start polling when on Step 4
  useEffect(() => {
    if (step === 4) {
      const checkIngestion = async () => {
        try {
          const res = await fetch(
            `/api/logs/search?projectId=${project.id}&timeRange=24h`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data.logs && data.logs.length > 0) {
              setIsIngested(true);
              setIngestionCount(data.logs.length);
              setPollingStatus("success");
            }
          }
        } catch (err) {
          console.error("Ingestion check error:", err);
        }
      };

      // Run immediately
      checkIngestion();

      // Poll every 2.5 seconds
      pollIntervalRef.current = setInterval(checkIngestion, 2500);
    } else {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [step, project.id]);

  // Fetch services when entering SLO setup step
  useEffect(() => {
    if (step === 5 && services.length === 0) {
      fetch(`/api/services?projectId=${project.id}`)
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch services");
          return res.json();
        })
        .then((data) => {
          if (data.services) {
            setServices(data.services);
          }
        })
        .catch((err) =>
          console.error("[Onboarding] Fetch services error:", err),
        )
        .finally(() => setIsLoadingServices(false));
    }
  }, [step, project.id, services.length]);

  const handleCopyText = (
    text: string,
    type: "key" | "code" | "install" | "curl",
  ) => {
    navigator.clipboard.writeText(text);
    if (type === "key") {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else if (type === "code") {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } else if (type === "install") {
      setCopiedInstall(true);
      setTimeout(() => setCopiedInstall(false), 2000);
    } else if (type === "curl") {
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 2000);
    }
  };

  const handleSaveSlos = async () => {
    setIsSavingSlos(true);
    try {
      const targetService = services[0];
      if (!targetService) {
        // No services, skip to webhooks step
        setStep(6);
        return;
      }

      const promises = [];

      if (enableAvailSlo) {
        promises.push(
          fetch("/api/services/slo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: project.id,
              serviceId: targetService.id,
              slo: {
                name: "Availability SLO",
                type: "availability",
                target: availSloTarget,
                windowDays: availSloWindow,
              },
            }),
          }),
        );
      }

      if (enableLatencySlo) {
        promises.push(
          fetch("/api/services/slo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: project.id,
              serviceId: targetService.id,
              slo: {
                name: "Latency SLO",
                type: "latency",
                target: latencySloTarget,
                windowDays: latencySloWindow,
                latencyThresholdMs: latencySloThreshold,
              },
            }),
          }),
        );
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      setStep(6);
    } catch (err) {
      console.error("[Onboarding] Error saving SLOs:", err);
      setStep(6);
    } finally {
      setIsSavingSlos(false);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/projects/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: project.name,
          slackWebhookUrl: slackWebhookUrl.trim(),
          discordWebhookUrl: discordWebhookUrl.trim(),
          teamsWebhookUrl: teamsWebhookUrl.trim(),
          minErrorCount: 3, // keep original defaults
          zScoreThreshold: 3.0,
        }),
      });

      if (res.ok) {
        router.push(`/dashboard?projectId=${project.id}`);
        router.refresh();
      } else {
        alert("Failed to complete onboarding setups");
      }
    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepTitles = [
    "Welcome",
    "Install SDK",
    "Integrate Code",
    "Ingest Logs",
    "Define SLOs",
    "Webhooks",
  ];

  return (
    <div className="max-w-4xl mx-auto py-4 space-y-8">
      {/* Horizontal Stepper Progress */}
      <div className="space-y-4">
        <div className="flex justify-between items-center px-2">
          <span className="text-xs font-semibold text-indigo-400 uppercase tracking-widest">
            Step {step} of 6
          </span>
          <span className="text-xs text-slate-500 font-medium">
            {stepTitles[step - 1]}
          </span>
        </div>
        <Progress value={((step - 1) / 5) * 100} className="h-1 bg-slate-900" />
      </div>

      {/* Stepper Dots (kept for aesthetic consistency with original onboarding UI) */}
      <div className="flex justify-between items-center px-2">
        {stepTitles.map((title, index) => {
          const stepNum = index + 1;
          const isActive = step === stepNum;
          const isCompleted = step > stepNum || (stepNum === 4 && isIngested);

          return (
            <div key={title} className="flex flex-col items-center gap-1.5">
              <div
                onClick={() => stepNum < step && setStep(stepNum)}
                className={`w-8 h-8 rounded-full border flex items-center justify-center font-mono text-xs font-bold transition-all duration-300 ${
                  isCompleted
                    ? "bg-indigo-600 border-indigo-500 text-white cursor-pointer"
                    : isActive
                      ? "bg-slate-950 border-indigo-500 text-indigo-400 shadow-lg shadow-indigo-500/10"
                      : "bg-slate-950 border-slate-900 text-slate-650"
                }`}
              >
                {isCompleted ? <Check className="w-3.5 h-3.5" /> : stepNum}
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider font-bold hidden sm:inline ${
                  isActive
                    ? "text-indigo-400"
                    : isCompleted
                      ? "text-slate-350"
                      : "text-slate-600"
                }`}
              >
                {title}
              </span>
            </div>
          );
        })}
      </div>

      {/* Steps Cards */}
      <Card className="relative overflow-hidden shadow-2xl">
        <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
        <CardContent className="p-6">
          {/* STEP 1: Project Identity */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Rocket className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Welcome to your new project!
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal">
                    You&apos;ve successfully created{" "}
                    <strong className="text-white font-semibold">
                      &quot;{project.name}&quot;
                    </strong>
                    . We have generated a unique API Ingestion Key.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-3 shadow-lg shadow-indigo-500/10">
                <div className="space-y-1">
                  <Label>Project ID</Label>
                  <div className="text-sm font-mono text-slate-300 select-all">
                    {project.id}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Your API Ingestion Key</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-sm font-mono text-indigo-300 select-all truncate">
                      {displayApiKey}
                    </div>
                    <Button
                      variant="secondary"
                      size="icon"
                      onClick={() => handleCopyText(displayApiKey, "key")}
                    >
                      {copiedKey ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                  {plainApiKey ? (
                    <p className="text-[11px] text-amber-400 font-semibold leading-relaxed mt-1.5 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
                      ⚠️ Make sure to copy this key now. For security, it is cryptographically hashed in our database and you will not see it again.
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-500 leading-relaxed mt-1">
                      ℹ️ For security, your key is only shown once at project creation. If you lost it, please create a new project.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setStep(2)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                >
                  Let&apos;s get started
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Install SDK */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Terminal className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Install the SDK client
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal">
                    Install our lightweight Node.js SDK logger client in your
                    application root directory.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-3.5 shadow-lg shadow-indigo-500/10">
                <div className="flex items-center justify-between gap-4">
                  <code className="text-sm font-mono text-indigo-300 select-all">
                    {installCmd}
                  </code>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() => handleCopyText(installCmd, "install")}
                  >
                    {copiedInstall ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Code Integration */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Code className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Initialize the logger client
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal">
                    Initialize the `Logger` instance in your code. Copy the
                    snippet containing your active API credentials:
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 relative overflow-hidden shadow-lg shadow-indigo-500/10">
                <div className="absolute right-3 top-3">
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={() =>
                      handleCopyText(sdkIntegrationSnippet, "code")
                    }
                    title="Copy Code Snippet"
                  >
                    {copiedCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
                <pre className="text-xs font-mono text-indigo-300 overflow-x-auto whitespace-pre leading-relaxed select-all max-h-52 pt-1">
                  {sdkIntegrationSnippet}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(2)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(4)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white"
                >
                  Next
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Live Ingestion Polling */}
          {step === 4 && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Activity className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Ingest your first log stream
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal font-sans">
                    Run your application (or a quick script) to ship a log
                    entry. The console will automatically detect the stream.
                  </p>
                </div>
              </div>

              {/* Ingestion Polling Card */}
              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-6 flex flex-col items-center justify-center min-h-35 text-center shadow-lg shadow-indigo-500/10">
                {pollingStatus === "polling" && (
                  <div className="space-y-3">
                    <RefreshCw className="w-7 h-7 text-indigo-500 animate-spin mx-auto" />
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">
                        Awaiting Log Streams
                      </h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-0.5 leading-normal">
                        Listening at{" "}
                        <code className="font-mono text-slate-400 text-[10px] break-all">
                          {endpointUrl}
                        </code>
                        . Send a test POST request or run your logger client...
                      </p>
                    </div>
                  </div>
                )}

                {pollingStatus === "success" && (
                  <div className="space-y-3">
                    <div className="w-9 h-9 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-emerald-400">
                        Log Ingestion Successful!
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mx-auto mt-0.5 leading-normal font-sans">
                        We successfully received and indexed{" "}
                        <strong className="text-white">
                          {ingestionCount} log{" "}
                          {ingestionCount === 1 ? "entry" : "entries"}
                        </strong>{" "}
                        in the database for this project!
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick curl instructions */}
              <div className="bg-slate-900/60 border border-indigo-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 font-sans">
                    Or test instantly using cURL:
                  </h4>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() =>
                      handleCopyText(
                        `curl -X POST "${endpointUrl}" -H "Content-Type: application/json" -H "x-api-key: ${displayApiKey}" -d '{"service": "main-api", "environment": "staging", "level": "info", "message": "First test log shipped successfully!"}'`,
                        "curl",
                      )
                    }
                  >
                    {copiedCurl ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
                <pre className="text-xs font-mono text-indigo-400 overflow-x-auto whitespace-pre-wrap select-all bg-slate-950 p-2 rounded border border-slate-900 break-all leading-normal">
                  {`curl -X POST "${endpointUrl}" -H "Content-Type: application/json" -H "x-api-key: ${displayApiKey}" -d '{"service": "main-api", "environment": "staging", "level": "info", "message": "First test log shipped successfully!"}'`}
                </pre>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(3)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(5)}
                  disabled={!isIngested}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Define SLO Targets
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: Define SLO Targets */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Sparkles className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Define Service Level Objectives (SLOs)
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal font-sans">
                    Set compliance targets for the ingested services. We&apos;ve
                    detected your service{" "}
                    <span className="text-white font-semibold">
                      &quot;{services[0]?.name || "main-api"}&quot;
                    </span>{" "}
                    in{" "}
                    <span className="text-indigo-400 font-semibold">
                      {services[0]?.environment || "staging"}
                    </span>
                    .
                  </p>
                </div>
              </div>

              {isLoadingServices ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <RefreshCw className="w-6 h-6 text-indigo-500 animate-spin" />
                  <span className="text-xs text-slate-500 font-medium">
                    Resolving ingested services...
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Availability SLO preset card */}
                  <div
                    className={`p-4 border rounded-xl transition-all duration-200 flex flex-col justify-between ${
                      enableAvailSlo
                        ? "bg-slate-950 border-indigo-500/30 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/40 border-slate-800/60 opacity-60"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            id="enableAvail"
                            checked={enableAvailSlo}
                            onChange={(e) =>
                              setEnableAvailSlo(e.target.checked)
                            }
                            className="rounded border-slate-805 text-indigo-650 focus:ring-indigo-500 cursor-pointer mt-1"
                          />
                          <div>
                            <label
                              htmlFor="enableAvail"
                              className="text-sm font-bold text-slate-200 cursor-pointer select-none"
                            >
                              Availability Target
                            </label>
                            <p className="text-xs text-slate-500 mt-0.5 leading-normal font-sans">
                              Alerts if error logs exceed the error budget
                              percentage in the given window.
                            </p>
                          </div>
                        </div>
                      </div>

                      {enableAvailSlo && (
                        <div className="mt-4 space-y-3.5 pl-6 border-l-2 border-indigo-950/60">
                          <div className="space-y-1">
                            <Label className="text-slate-500">
                              Compliance Target
                            </Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="100"
                                value={availSloTarget}
                                onChange={(e) =>
                                  setAvailSloTarget(
                                    parseFloat(e.target.value) || 99.0,
                                  )
                                }
                                className="pl-3 pr-8 font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-550 pointer-events-none uppercase font-mono">
                                %
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-505">
                              Rolling Window
                            </Label>
                            <div className="relative">
                              <Input
                                type="number"
                                min="1"
                                max="90"
                                value={availSloWindow}
                                onChange={(e) =>
                                  setAvailSloWindow(
                                    parseInt(e.target.value) || 30,
                                  )
                                }
                                className="pl-3 pr-14 font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-550 pointer-events-none lowercase font-sans">
                                days
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Latency SLO preset card */}
                  <div
                    className={`p-4 border rounded-xl transition-all duration-200 flex flex-col justify-between ${
                      enableLatencySlo
                        ? "bg-slate-950 border-indigo-500/30 shadow-lg shadow-indigo-500/10"
                        : "bg-slate-900/40 border-slate-800/60 opacity-60"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            id="enableLatency"
                            checked={enableLatencySlo}
                            onChange={(e) =>
                              setEnableLatencySlo(e.target.checked)
                            }
                            className="rounded border-slate-805 text-indigo-650 focus:ring-indigo-500 cursor-pointer mt-1"
                          />
                          <div>
                            <label
                              htmlFor="enableLatency"
                              className="text-sm font-bold text-slate-200 cursor-pointer select-none"
                            >
                              Latency Performance
                            </label>
                            <p className="text-xs text-slate-500 mt-0.5 leading-normal font-sans">
                              Tracks the percentage of requests completing
                              within the threshold speed limit.
                            </p>
                          </div>
                        </div>
                      </div>

                      {enableLatencySlo && (
                        <div className="mt-4 space-y-3 pl-6 border-l-2 border-indigo-950/60">
                          <div className="space-y-1">
                            <Label className="text-slate-505">Threshold</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                min="1"
                                value={latencySloThreshold}
                                onChange={(e) =>
                                  setLatencySloThreshold(
                                    parseInt(e.target.value) || 500,
                                  )
                                }
                                className="pl-3 pr-10 font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-550 pointer-events-none lowercase font-mono">
                                ms
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-505">Compliance</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                step="0.1"
                                min="0.1"
                                max="100"
                                value={latencySloTarget}
                                onChange={(e) =>
                                  setLatencySloTarget(
                                    parseFloat(e.target.value) || 95.0,
                                  )
                                }
                                className="pl-3 pr-8 font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-550 pointer-events-none uppercase font-mono">
                                %
                              </span>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-slate-505">Window</Label>
                            <div className="relative">
                              <Input
                                type="number"
                                min="1"
                                max="90"
                                value={latencySloWindow}
                                onChange={(e) =>
                                  setLatencySloWindow(
                                    parseInt(e.target.value) || 30,
                                  )
                                }
                                className="pl-3 pr-14 font-mono"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-550 pointer-events-none lowercase font-sans">
                                days
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800/40">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(4)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>

                <Button
                  onClick={handleSaveSlos}
                  disabled={isSavingSlos}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  {isSavingSlos ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                      Saving SLOs...
                    </>
                  ) : (
                    <>
                      Configure Alerts
                      <ArrowRight className="w-4 h-4 ml-1.5" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6: Webhooks & Finish */}
          {step === 6 && (
            <form onSubmit={handleCompleteOnboarding} className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Volume2 className="w-5 h-5 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-bold text-white leading-tight">
                    Setup Webhook Notifications
                  </h2>
                  <p className="text-xs text-slate-400 leading-normal font-sans">
                    Finally, set up alerting integrations to get instant AI
                    diagnostic summaries and SLO budget updates pushed directly
                    to your team&apos;s communication channels.
                  </p>
                </div>
              </div>

              <div className="bg-slate-950 border border-indigo-500/30 rounded-xl p-4 space-y-4 shadow-lg shadow-indigo-500/10 max-w-xl">
                <div className="space-y-2">
                  <Label htmlFor="slackWebhookInput">Slack Webhook URL</Label>
                  <Input
                    id="slackWebhookInput"
                    type="url"
                    value={slackWebhookUrl}
                    onChange={(e) => setSlackWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                    className="font-mono placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="discordWebhookInput">
                    Discord Webhook URL
                  </Label>
                  <Input
                    id="discordWebhookInput"
                    type="url"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    placeholder="https://discord.com/api/webhooks/XXXX"
                    className="font-mono placeholder:text-slate-700"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="teamsWebhookInput">
                    Microsoft Teams Webhook URL
                  </Label>
                  <Input
                    id="teamsWebhookInput"
                    type="url"
                    value={teamsWebhookUrl}
                    onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                    placeholder="https://outlook.office.com/webhook/XXXX"
                    className="font-mono placeholder:text-slate-700"
                  />
                </div>

                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  You can skip these webhooks and configure notification
                  channels later inside your Project Settings page.
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800/40">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(5)}
                  className="text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back
                </Button>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  <Sparkles className="w-4 h-4 mr-1.5" />
                  {isSubmitting
                    ? "Finishing..."
                    : "Complete Setup & Go to Dashboard"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
