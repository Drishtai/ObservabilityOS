"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  Clock,
  GitBranch,
  GitCommit,
  AlertCircle,
  AlertTriangle,
  Activity,
  RefreshCw,
  ShieldCheck,
  Plus,
  Trash2,
  Sliders,
  Percent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ServiceProps {
  id: string;
  name: string;
  environment: "prod" | "staging" | "dev";
  createdAt: string;
  runbookUrl?: string | null;
  troubleshootingSteps?: string | null;
}

interface DeploymentProps {
  id: string;
  commitSha: string;
  commitMessage: string;
  branch: string;
  deployedAt: string | null;
}

interface IncidentProps {
  id: string;
  title: string;
  status: "open" | "investigating" | "resolved";
  createdAt: string;
  confidence: number;
}

interface ServiceDetailProps {
  projectId: string;
  service: ServiceProps;
  deployments: DeploymentProps[];
  incidents: IncidentProps[];
}

interface MetricPoint {
  timestamp: string;
  cpu: number;
  memory: number;
  memoryLimit: number;
  latency: number;
}

interface SloStatusPoint {
  name: string;
  type: "availability" | "latency";
  target: number;
  windowDays: number;
  latencyThresholdMs?: number;
  compliance: number;
  totalRequests: number;
  goodRequests: number;
  badRequests: number;
  budgetRemaining: number;
  budgetRemainingPercent: number;
  status: "healthy" | "warning" | "breached";
}

export default function ServiceDetailView({
  projectId,
  service,
  deployments,
  incidents,
}: ServiceDetailProps) {
  const router = useRouter();
  const [timeRange, setTimeRange] = useState<"1h" | "24h" | "7d">("24h");
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  // SLO States
  const [sloStatus, setSloStatus] = useState<SloStatusPoint[]>([]);
  const [isLoadingSlos, setIsLoadingSlos] = useState(true);
  const [isSloModalOpen, setIsSloModalOpen] = useState(false);
  const [isSubmittingSlo, setIsSubmittingSlo] = useState(false);

  // Form states for new/edit SLO
  const [sloName, setSloName] = useState("");
  const [sloType, setSloType] = useState<"availability" | "latency">(
    "availability",
  );
  const [sloTarget, setSloTarget] = useState(99.0);
  const [sloWindow, setSloWindow] = useState(30);
  const [sloLatencyMs, setSloLatencyMs] = useState(500);

  const [prevServiceId, setPrevServiceId] = useState(service.id);
  const [prevProjectId, setPrevProjectId] = useState(projectId);

  if (service.id !== prevServiceId || projectId !== prevProjectId) {
    setPrevServiceId(service.id);
    setPrevProjectId(projectId);
    setIsLoadingSlos(true);
  }

  const activeIncidents = incidents.filter((i) => i.status !== "resolved");
  const isHealthy = activeIncidents.length === 0;

  // Service settings states
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [runbookUrl, setRunbookUrl] = useState(service.runbookUrl || "");
  const [troubleshootingSteps, setTroubleshootingSteps] = useState(
    service.troubleshootingSteps || "",
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isDeletingService, setIsDeletingService] = useState(false);

  const handleDeleteService = async () => {
    const confirmation = prompt(
      `To delete this service, please type its name: "${service.name}"`,
    );
    if (confirmation !== service.name) {
      alert("Name verification failed. Service deletion canceled.");
      return;
    }

    setIsDeletingService(true);
    try {
      const res = await fetch(
        `/api/services?projectId=${projectId}&serviceId=${service.id}`,
        {
          method: "DELETE",
        },
      );

      if (res.ok) {
        setIsSettingsModalOpen(false);
        router.push(`/dashboard?projectId=${projectId}`);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error?.message || "Failed to delete service");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting service");
    } finally {
      setIsDeletingService(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingSettings(true);
    try {
      const res = await fetch("/api/services", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          serviceId: service.id,
          runbookUrl: runbookUrl.trim(),
          troubleshootingSteps: troubleshootingSteps,
        }),
      });

      if (res.ok) {
        setIsSettingsModalOpen(false);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error?.message || "Failed to save settings");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving service settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Load metrics
  useEffect(() => {
    let active = true;
    async function loadMetrics() {
      setIsLoading(true);
      setError("");
      try {
        const res = await fetch(
          `/api/metrics/query?projectId=${projectId}&serviceId=${service.id}&timeRange=${timeRange}`,
        );
        const data = await res.json();
        if (!active) return;
        if (res.ok) {
          setMetrics(data.metrics || []);
        } else {
          setError(data.error?.message || "Failed to load metrics");
        }
      } catch {
        if (active) {
          setError("Failed to communicate with metrics server");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadMetrics();
    return () => {
      active = false;
    };
  }, [timeRange, projectId, service.id]);

  // Load SLO status helper
  const loadSloStatus = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoadingSlos(true);
      }
      try {
        const res = await fetch(
          `/api/services/slo/status?projectId=${projectId}&serviceId=${service.id}`,
        );
        if (res.ok) {
          const data = await res.json();
          setSloStatus(data.slos || []);
        }
      } catch {
        console.error("Failed to load SLO statuses");
      } finally {
        setIsLoadingSlos(false);
      }
    },
    [projectId, service.id],
  );

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSloStatus(false);
    });
  }, [loadSloStatus]);

  // Handle SLO submission
  const handleCreateSlo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sloName.trim()) return;

    setIsSubmittingSlo(true);
    try {
      const res = await fetch("/api/services/slo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          serviceId: service.id,
          slo: {
            name: sloName.trim(),
            type: sloType,
            target: Number(sloTarget),
            windowDays: Number(sloWindow),
            latencyThresholdMs:
              sloType === "latency" ? Number(sloLatencyMs) : undefined,
          },
        }),
      });

      if (res.ok) {
        setSloName("");
        setSloType("availability");
        setSloTarget(99.0);
        setSloWindow(30);
        setSloLatencyMs(500);
        setIsSloModalOpen(false);
        await loadSloStatus();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to create SLO");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving SLO target");
    } finally {
      setIsSubmittingSlo(false);
    }
  };

  // Handle SLO deletion
  const handleDeleteSlo = async (name: string) => {
    if (!confirm(`Are you sure you want to delete the SLO "${name}"?`)) return;

    try {
      const res = await fetch(
        `/api/services/slo?projectId=${projectId}&serviceId=${service.id}&sloName=${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
      if (res.ok) {
        await loadSloStatus();
      } else {
        alert("Failed to delete SLO target");
      }
    } catch (err) {
      console.error(err);
      alert("Error deleting SLO target");
    }
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <NextLink
          href={`/dashboard?projectId=${projectId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </NextLink>
      </div>

      {/* Service Header Info */}
      <div className="p-6 rounded-2xl border border-slate-900 bg-slate-950 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-50 h-50 bg-indigo-500/5 rounded-full blur-[60px] pointer-events-none" />

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                service.environment === "prod"
                  ? "bg-rose-500/10 border-rose-500/20 text-rose-450"
                  : service.environment === "staging"
                    ? "bg-amber-500/10 border-amber-500/20 text-amber-450"
                    : "bg-emerald-500/10 border-emerald-500/20 text-emerald-450"
              }`}
            >
              {service.environment}
            </span>
            <span className="text-[10px] text-slate-550 font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
              Service
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3 shrink-0">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isHealthy ? "bg-emerald-400" : "bg-rose-400"}`}
              />
              <span
                className={`relative inline-flex rounded-full h-3 w-3 ${isHealthy ? "bg-emerald-500" : "bg-rose-500"}`}
              />
            </span>
            <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">
              {service.name}
            </h1>
          </div>
        </div>

        {/* Time Selector */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-0.5 text-xs self-start md:self-center shrink-0">
          {(["1h", "24h", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
                timeRange === r
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-455 hover:text-slate-200"
              }`}
            >
              {r === "1h" ? "1 Hour" : r === "24h" ? "24 Hours" : "7 Days"}
            </button>
          ))}
        </div>
      </div>

      {/* Service Level Objectives (SLOs) Section */}
      <section className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-white">
              Service Level Objectives (SLOs)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              Service Settings
            </button>
            <button
              onClick={() => setIsSloModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              Configure SLOs
            </button>
          </div>
        </div>

        {isLoadingSlos ? (
          <div className="text-center py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
            Calculating budgets...
          </div>
        ) : sloStatus.length === 0 ? (
          <div className="text-center py-8 max-w-md mx-auto space-y-4">
            <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto" />
            <div>
              <h3 className="text-xs font-bold text-slate-350 uppercase tracking-wider font-sans">
                No SLOs Configured
              </h3>
              <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                Define availability or latency objectives to track
                rolling-window error budgets and maintain reliability targets.
              </p>
            </div>
            <button
              onClick={() => setIsSloModalOpen(true)}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Define First SLO Target
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {sloStatus.map((slo) => {
              const theme = {
                healthy: {
                  border: "border-emerald-500/20 bg-emerald-500/5",
                  text: "text-emerald-450",
                  bar: "bg-emerald-500",
                  badge:
                    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                },
                warning: {
                  border: "border-amber-500/20 bg-amber-500/5",
                  text: "text-amber-450",
                  bar: "bg-amber-500",
                  badge: "bg-amber-500/10 text-amber-400 border-amber-500/20",
                },
                breached: {
                  border: "border-rose-500/20 bg-rose-500/5",
                  text: "text-rose-450",
                  bar: "bg-rose-500 animate-pulse",
                  badge: "bg-rose-500/10 text-rose-400 border-rose-500/20",
                },
              }[slo.status];

              return (
                <div
                  key={slo.name}
                  className="border border-slate-900 bg-slate-900/15 rounded-xl p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-sm font-bold text-white leading-tight">
                        {slo.name}
                      </h3>
                      <div className="flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="capitalize">{slo.type} SLO</span>
                        <span>•</span>
                        <span>Rolling {slo.windowDays}d Window</span>
                        {slo.type === "latency" && (
                          <>
                            <span>•</span>
                            <span>
                              Threshold: &lt;={slo.latencyThresholdMs}ms
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <span
                      className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border ${theme.badge}`}
                    >
                      {slo.status === "healthy"
                        ? "Compliant"
                        : slo.status === "warning"
                          ? "Low Budget"
                          : "Breached"}
                    </span>
                  </div>

                  {/* Compliance Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-end text-xs">
                      <div className="space-x-1">
                        <span className="font-mono font-bold text-slate-200 text-sm">
                          {slo.compliance.toFixed(3)}%
                        </span>
                        <span className="text-slate-500 font-sans">
                          compliance
                        </span>
                      </div>
                      <span className="text-slate-550 text-[10px] font-semibold">
                        Target: &gt;={slo.target}%
                      </span>
                    </div>

                    <div className="h-2 bg-slate-950 border border-slate-900 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${theme.bar}`}
                        style={{
                          width: `${Math.min(100, Math.max(0, (slo.compliance / 100) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  {/* Error Budget Widget */}
                  <div
                    className={`p-3 rounded-lg border ${theme.border} flex items-center justify-between gap-4`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="space-y-0.5">
                        <span className="block text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                          Remaining Error Budget
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {slo.budgetRemaining < 0
                            ? 0
                            : Math.round(slo.budgetRemaining)}{" "}
                          events
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span
                        className={`block text-sm font-mono font-bold ${theme.text}`}
                      >
                        {slo.budgetRemainingPercent}%
                      </span>
                      <span className="text-[9px] text-slate-500">
                        budget left
                      </span>
                    </div>
                  </div>

                  {/* Detailed statistics */}
                  <div className="grid grid-cols-3 gap-2 pt-1.5 text-center text-[10px] text-slate-500 font-mono">
                    <div>
                      <span className="block text-slate-600 font-semibold uppercase text-[8px] tracking-wider mb-0.5">
                        Total Requests
                      </span>
                      <span className="text-slate-400 font-bold">
                        {slo.totalRequests}
                      </span>
                    </div>
                    <div className="border-l border-r border-slate-900">
                      <span className="block text-slate-600 font-semibold uppercase text-[8px] tracking-wider mb-0.5">
                        Good requests
                      </span>
                      <span className="text-slate-400 font-bold">
                        {slo.goodRequests}
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-650 font-semibold uppercase text-[8px] tracking-wider mb-0.5">
                        SLO Failures
                      </span>
                      <span
                        className={`font-bold ${slo.badRequests > 0 ? "text-rose-450" : "text-slate-400"}`}
                      >
                        {slo.badRequests}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Main Charts Console */}
      {isLoading ? (
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3 min-h-75">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-sm font-semibold text-slate-455">
            Loading timeseries metrics metrics...
          </p>
        </div>
      ) : error ? (
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-3 min-h-75 text-rose-400">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm font-semibold">{error}</p>
        </div>
      ) : metrics.length === 0 ? (
        <div className="bg-slate-950 border border-slate-900 rounded-2xl p-16 text-center flex flex-col items-center justify-center gap-4 min-h-75">
          <Activity className="w-10 h-10 text-slate-755" />
          <div>
            <h3 className="text-sm font-bold text-slate-350 mb-1">
              No Metrics Data Found
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              We haven&apos;t received any CPU, memory, or latency metrics for
              this service during this period. Ingest metrics to see statistics.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* CPU utilization */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <Cpu className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                CPU Usage
              </h3>
            </div>
            <SVGMetricChart data={metrics} type="cpu" color="indigo" unit="%" />
          </div>

          {/* Memory Utilization */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-amber-400">
              <HardDrive className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Memory Usage
              </h3>
            </div>
            <SVGMetricChart
              data={metrics}
              type="memory"
              color="amber"
              unit="MB"
            />
          </div>

          {/* Latency statistics */}
          <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-450">
              <Clock className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Response Latency
              </h3>
            </div>
            <SVGMetricChart
              data={metrics}
              type="latency"
              color="emerald"
              unit="ms"
            />
          </div>
        </div>
      )}

      {/* History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recent Releases */}
        <section className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-2 border-b border-slate-900">
            <GitBranch className="w-4 h-4 text-indigo-400" />
            Recent Service Deployments
          </h2>
          {deployments.length === 0 ? (
            <p className="text-xs text-slate-500 italic py-4">
              No deployments recorded for this service.
            </p>
          ) : (
            <div className="space-y-4">
              {deployments.map((d) => (
                <div
                  key={d.id}
                  className="flex items-start gap-3 text-xs bg-slate-900/40 border border-slate-900 p-3 rounded-lg hover:border-slate-800 transition-colors"
                >
                  <GitCommit className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-slate-200 truncate">
                      {d.commitMessage}
                    </p>
                    <div className="flex items-center gap-3 text-[10px] text-slate-550">
                      <span className="font-mono bg-slate-950 px-1 py-0.5 rounded border border-slate-800/80 text-slate-400">
                        {d.commitSha.slice(0, 7)}
                      </span>
                      <span>Branch: {d.branch}</span>
                      <span>
                        {d.deployedAt
                          ? new Date(d.deployedAt).toLocaleString()
                          : ""}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Incidents */}
        <section className="bg-slate-950 border border-slate-900 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 pb-2 border-b border-slate-900">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            Recent Service Incidents
          </h2>
          {incidents.length === 0 ? (
            <p className="text-xs text-slate-550 italic py-4">
              No incidents detected for this service.
            </p>
          ) : (
            <div className="space-y-4">
              {incidents.map((i) => {
                const statusColor =
                  i.status === "open"
                    ? "bg-rose-500/10 border-rose-500/20 text-rose-450"
                    : i.status === "investigating"
                      ? "bg-amber-500/10 border-amber-500/20 text-amber-450"
                      : "bg-emerald-500/10 border-emerald-500/20 text-emerald-450";
                return (
                  <NextLink
                    key={i.id}
                    href={`/dashboard/incidents/${i.id}?projectId=${projectId}`}
                    className="flex items-start justify-between gap-3 text-xs bg-slate-900/40 border border-slate-900 p-3 rounded-lg hover:border-slate-800 transition-colors cursor-pointer group"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-semibold text-slate-200 group-hover:text-indigo-400 transition-colors truncate">
                        {i.title}
                      </p>
                      <div className="flex items-center gap-3 text-[10px] text-slate-500">
                        <span>
                          Confidence: {Math.round(i.confidence * 100)}%
                        </span>
                        <span>{new Date(i.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[9px] uppercase tracking-wider px-2 py-0.5 rounded border shrink-0 ${statusColor}`}
                    >
                      {i.status}
                    </span>
                  </NextLink>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Configure SLO Modal */}
      <Dialog open={isSloModalOpen} onOpenChange={setIsSloModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Configure SLO targets</DialogTitle>
            <DialogDescription>
              Establish performance and availability targets for this service.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-6 pr-1 my-4">
            {/* List of active SLOs */}
            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Active SLO Targets ({sloStatus.length})
              </h4>
              {sloStatus.length === 0 ? (
                <p className="text-xs text-slate-500 italic bg-slate-950/40 p-4 border border-dashed border-slate-800 rounded-lg text-center font-sans">
                  No SLO targets currently defined.
                </p>
              ) : (
                <div className="divide-y divide-slate-850 bg-slate-955 border border-slate-850 rounded-lg overflow-hidden">
                  {sloStatus.map((slo) => (
                    <div
                      key={slo.name}
                      className="flex items-center justify-between p-3 gap-4 text-xs font-mono"
                    >
                      <div className="space-y-0.5">
                        <span className="font-semibold text-slate-200 font-sans">
                          {slo.name}
                        </span>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500">
                          <span className="capitalize">{slo.type}</span>
                          <span>Target: {slo.target}%</span>
                          <span>Window: {slo.windowDays} days</span>
                          {slo.type === "latency" && (
                            <span>
                              Threshold: &lt;={slo.latencyThresholdMs}ms
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteSlo(slo.name)}
                        className="text-slate-500 hover:text-rose-400 cursor-pointer"
                        title="Delete Target"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add SLO Form */}
            <form
              onSubmit={handleCreateSlo}
              className="border-t border-slate-800 pt-6 space-y-4"
            >
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Add / Edit SLO Target
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="sloNameInput">SLO Objective Name</Label>
                  <Input
                    id="sloNameInput"
                    type="text"
                    required
                    value={sloName}
                    onChange={(e) => setSloName(e.target.value)}
                    placeholder="e.g. Core API Availability"
                  />
                </div>

                {/* Type */}
                <div className="space-y-2">
                  <Label>Objective Type</Label>
                  <div className="flex bg-slate-950 border border-slate-800 rounded-lg p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setSloType("availability")}
                      className={`flex-1 py-1.5 rounded-md font-semibold text-center cursor-pointer transition-colors ${
                        sloType === "availability"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Availability
                    </button>
                    <button
                      type="button"
                      onClick={() => setSloType("latency")}
                      className={`flex-1 py-1.5 rounded-md font-semibold text-center cursor-pointer transition-colors ${
                        sloType === "latency"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-500 hover:text-slate-300"
                      }`}
                    >
                      Latency
                    </button>
                  </div>
                </div>

                {/* Target % */}
                <div className="space-y-2">
                  <Label htmlFor="sloTargetInput">Target Reliability (%)</Label>
                  <div className="relative">
                    <Input
                      id="sloTargetInput"
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      max="100"
                      value={sloTarget}
                      onChange={(e) =>
                        setSloTarget(
                          Math.min(
                            100,
                            Math.max(0, parseFloat(e.target.value) || 99.0),
                          ),
                        )
                      }
                      className="pr-8 font-mono"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-500 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                {/* Window Days */}
                <div className="space-y-2">
                  <Label>Rolling Window Period</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {[7, 30].map((d) => (
                      <Button
                        key={d}
                        type="button"
                        variant={sloWindow === d ? "default" : "secondary"}
                        size="sm"
                        onClick={() => setSloWindow(d)}
                        className="cursor-pointer"
                      >
                        {d} Days
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Latency Threshold (Ms) */}
                {sloType === "latency" && (
                  <div className="space-y-2">
                    <Label htmlFor="sloLatencyInput">
                      Latency Threshold (ms)
                    </Label>
                    <Input
                      id="sloLatencyInput"
                      type="number"
                      required
                      min="1"
                      value={sloLatencyMs}
                      onChange={(e) =>
                        setSloLatencyMs(
                          Math.max(1, parseInt(e.target.value) || 500),
                        )
                      }
                      className="font-mono"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={isSubmittingSlo}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {isSubmittingSlo ? "Saving..." : "Save Objective Target"}
                </Button>
              </div>
            </form>
          </div>

          <DialogFooter className="border-t border-slate-800 pt-4">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsSloModalOpen(false)}
            >
              Close Configuration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Settings Modal */}
      <Dialog open={isSettingsModalOpen} onOpenChange={setIsSettingsModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Service Settings</DialogTitle>
            <DialogDescription>
              Configure runbook links and custom troubleshooting steps for{" "}
              {service.name}.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={handleSaveSettings}
            className="space-y-5 flex-1 overflow-y-auto pr-1 my-4"
          >
            {/* Runbook URL */}
            <div className="space-y-2">
              <Label htmlFor="runbookUrlInput">Runbook URL</Label>
              <Input
                id="runbookUrlInput"
                type="url"
                value={runbookUrl}
                onChange={(e) => setRunbookUrl(e.target.value)}
                placeholder="https://wiki.company.com/runbooks/service-name"
                className="font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                External document link rendered directly inside incidents
                triggered by this service.
              </p>
            </div>

            {/* Troubleshooting Steps */}
            <div className="space-y-2">
              <Label htmlFor="troubleshootingInput">
                Troubleshooting Checklist / Guidelines
              </Label>
              <textarea
                id="troubleshootingInput"
                rows={6}
                value={troubleshootingSteps}
                onChange={(e) => setTroubleshootingSteps(e.target.value)}
                placeholder="1. Verify database connectivity&#10;2. Check memory utilization metrics&#10;3. Inspect dependency service health logs"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder:text-slate-700 focus:outline-none focus:border-indigo-500 transition-colors resize-none font-sans leading-relaxed"
              />
              <p className="text-[10px] text-slate-500 mt-1 font-sans">
                Step-by-step checklist or reference instructions to guide
                developers when resolving incidents.
              </p>
            </div>

            {/* Danger Zone */}
            <div className="pt-4 border-t border-slate-800 space-y-3">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-500 flex items-center gap-1.5 font-sans">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                Danger Zone
              </span>
              <div className="bg-rose-500/5 border border-rose-500/10 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="block text-xs font-semibold text-rose-400">
                    Delete Service
                  </span>
                  <span className="block text-[10px] text-slate-500 leading-relaxed font-sans">
                    Permanently delete this service, its associated SLO targets,
                    anomalies, log records, and comments. This action is
                    irreversible.
                  </span>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={isDeletingService}
                  onClick={handleDeleteService}
                >
                  {isDeletingService ? "Deleting..." : "Delete Service"}
                </Button>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-800 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsSettingsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSavingSettings}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
              >
                {isSavingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ChartProps {
  data: MetricPoint[];
  type: "cpu" | "memory" | "latency";
  color: "indigo" | "amber" | "emerald";
  unit: string;
}

function SVGMetricChart({ data, type, color, unit }: ChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    val: number;
    time: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const values = data.map((d) => d[type]);
  const minValue = 0;
  // Pad the max value so chart is scaled properly
  const dataMax = Math.max(...values, 1);
  const maxValue = type === "cpu" ? 100 : dataMax * 1.15;

  const width = 500;
  const height = 180;
  const padding = { top: 15, right: 15, bottom: 25, left: 40 };

  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Generate SVG coordinate points
  const points = data.map((pt, i) => {
    const val = pt[type];
    const x = padding.left + (i / Math.max(1, data.length - 1)) * plotWidth;
    const y =
      padding.top +
      plotHeight -
      ((val - minValue) / (maxValue - minValue)) * plotHeight;
    return {
      x,
      y,
      val,
      time: new Date(pt.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  });

  const linePath =
    points.length > 0
      ? `M ${points[0].x} ${points[0].y} ` +
        points
          .slice(1)
          .map((p) => `L ${p.x} ${p.y}`)
          .join(" ")
      : "";

  const areaPath =
    points.length > 0
      ? `${linePath} L ${points[points.length - 1].x} ${padding.top + plotHeight} L ${points[0].x} ${padding.top + plotHeight} Z`
      : "";

  const colorThemes = {
    indigo: {
      stroke: "#6366f1",
      fill: "url(#grad-indigo)",
      gradient: (
        <linearGradient id="grad-indigo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
        </linearGradient>
      ),
    },
    amber: {
      stroke: "#f59e0b",
      fill: "url(#grad-amber)",
      gradient: (
        <linearGradient id="grad-amber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.0" />
        </linearGradient>
      ),
    },
    emerald: {
      stroke: "#10b981",
      fill: "url(#grad-emerald)",
      gradient: (
        <linearGradient id="grad-emerald" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
        </linearGradient>
      ),
    },
  };

  const theme = colorThemes[color];

  // Mouse move event tracker to trigger tooltip
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!containerRef.current || points.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;

    // Scaling factor from real mouse coordinates to SVG viewBox coords
    const svgMouseX = (mouseX / rect.width) * width;

    // Find nearest point
    let nearest = points[0];
    let minDiff = Math.abs(points[0].x - svgMouseX);

    for (let i = 1; i < points.length; i++) {
      const diff = Math.abs(points[i].x - svgMouseX);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = points[i];
      }
    }

    setHoveredPoint(nearest);
  };

  const handleMouseLeave = () => {
    setHoveredPoint(null);
  };

  const yTicks = [
    minValue,
    minValue + (maxValue - minValue) * 0.33,
    minValue + (maxValue - minValue) * 0.66,
    maxValue,
  ];

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none cursor-crosshair overflow-visible"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <defs>{theme.gradient}</defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => {
          const y =
            padding.top +
            plotHeight -
            ((tick - minValue) / (maxValue - minValue)) * plotHeight;
          return (
            <g key={i}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="#1e293b"
                strokeWidth="0.8"
                strokeDasharray={
                  i === 0 || i === yTicks.length - 1 ? "0" : "4 4"
                }
              />
              <text
                x={padding.left - 8}
                y={y + 3}
                fill="#64748b"
                fontSize="9"
                fontWeight="600"
                fontFamily="monospace"
                textAnchor="end"
              >
                {Math.round(tick)}
                {i === yTicks.length - 1 ? unit : ""}
              </text>
            </g>
          );
        })}

        {/* Ingested metrics path rendering */}
        {points.length > 0 && (
          <>
            <path d={areaPath} fill={theme.fill} />
            <path
              d={linePath}
              fill="none"
              stroke={theme.stroke}
              strokeWidth="1.8"
            />

            {/* Draw single boundary circle markers if data set is very small */}
            {data.length <= 15 &&
              points.map((p, idx) => (
                <circle
                  key={idx}
                  cx={p.x}
                  cy={p.y}
                  r="3"
                  fill="#0f172a"
                  stroke={theme.stroke}
                  strokeWidth="1.5"
                />
              ))}
          </>
        )}

        {/* Hover elements */}
        {hoveredPoint && (
          <>
            <line
              x1={hoveredPoint.x}
              y1={padding.top}
              x2={hoveredPoint.x}
              y2={padding.top + plotHeight}
              stroke="#475569"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            <circle
              cx={hoveredPoint.x}
              cy={hoveredPoint.y}
              r="4.5"
              fill={theme.stroke}
              stroke="#0f172a"
              strokeWidth="2"
            />
          </>
        )}

        {/* X Axis Time Labels */}
        {points.length > 1 && (
          <>
            {/* Start label */}
            <text
              x={points[0].x}
              y={height - 8}
              fill="#64748b"
              fontSize="9"
              fontFamily="sans-serif"
              textAnchor="start"
            >
              {points[0].time}
            </text>
            {/* Middle label */}
            <text
              x={points[Math.floor(points.length / 2)].x}
              y={height - 8}
              fill="#64748b"
              fontSize="9"
              fontFamily="sans-serif"
              textAnchor="middle"
            >
              {points[Math.floor(points.length / 2)].time}
            </text>
            {/* End label */}
            <text
              x={points[points.length - 1].x}
              y={height - 8}
              fill="#64748b"
              fontSize="9"
              fontFamily="sans-serif"
              textAnchor="end"
            >
              {points[points.length - 1].time}
            </text>
          </>
        )}
      </svg>

      {/* Floating HTML tooltip */}
      {hoveredPoint && (
        <div
          className="absolute z-10 bg-slate-900 border border-slate-800/80 rounded-lg p-2 text-[10px] pointer-events-none shadow-xl flex flex-col gap-0.5 animate-fade-in"
          style={{
            left: `${(hoveredPoint.x / width) * 100}%`,
            top: `${(hoveredPoint.y / height) * 100 - 35}%`,
            transform: "translateX(-50%)",
          }}
        >
          <span className="font-mono text-slate-550">{hoveredPoint.time}</span>
          <span className="font-bold text-white font-mono">
            {hoveredPoint.val.toFixed(1)} {unit}
          </span>
        </div>
      )}
    </div>
  );
}
