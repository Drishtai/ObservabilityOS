"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Settings,
  Save,
  Check,
  AlertTriangle,
  Terminal,
  Volume2,
  RefreshCw,
  HardDrive,
  Trash2,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SettingsViewProps {
  project: {
    id: string;
    name: string;
    apiKey: string;
    slackWebhookUrl: string;
    discordWebhookUrl: string;
    teamsWebhookUrl: string;
    minErrorCount: number;
    zScoreThreshold: number;
  };
}

interface AuditLog {
  id: string;
  createdAt: string;
  action: string;
  targetId?: string;
  targetEntity?: string;
  user?: {
    username: string;
  };
  metadata?: {
    environment?: string;
    target?: number;
    slackChanged?: boolean;
    discordChanged?: boolean;
    teamsChanged?: boolean;
  };
}

export default function SettingsView({ project }: SettingsViewProps) {
  const router = useRouter();
  const [name, setName] = useState(project.name);

  // Audit Logs States
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(true);

  const [prevProjectId, setPrevProjectId] = useState(project.id);
  if (project.id !== prevProjectId) {
    setPrevProjectId(project.id);
    setIsLoadingAudit(true);
  }

  const fetchAuditLogs = useCallback(
    async (showLoading = true) => {
      if (showLoading) {
        setIsLoadingAudit(true);
      }
      try {
        const res = await fetch(
          `/api/projects/audit-logs?projectId=${project.id}`,
        );
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data.auditLogs || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoadingAudit(false);
      }
    },
    [project.id],
  );

  const [retentionStats, setRetentionStats] = useState<{
    plan: string;
    retentionDays: number;
    thresholdDate: string;
    oldestRecordDate: string | null;
    totalRecords: number;
    totalLogs: number;
    totalMetrics: number;
    totalSpans: number;
    expiredRecords: number;
    expiredLogs: number;
    expiredMetrics: number;
    expiredSpans: number;
  } | null>(null);
  const [isLoadingRetention, setIsLoadingRetention] = useState(true);
  const [isPurging, setIsPurging] = useState(false);
  const [purgeMessage, setPurgeMessage] = useState<string | null>(null);

  const fetchRetentionStats = useCallback(async () => {
    setIsLoadingRetention(true);
    try {
      const res = await fetch(
        `/api/projects/retention?projectId=${project.id}`,
      );
      if (res.ok) {
        const data = await res.json();
        setRetentionStats(data.retention || null);
      }
    } catch (err) {
      console.error("Failed to load retention stats:", err);
    } finally {
      setIsLoadingRetention(false);
    }
  }, [project.id]);

  const handleManualPurge = async () => {
    if (
      !confirm(
        "Are you sure you want to permanently purge records older than your plan retention window?",
      )
    ) {
      return;
    }
    setIsPurging(true);
    setPurgeMessage(null);
    try {
      const res = await fetch("/api/projects/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setPurgeMessage(
          `Purged ${data.purged.totalDeleted} expired records (${data.purged.deletedLogsCount} logs, ${data.purged.deletedSpansCount} spans, ${data.purged.deletedMetricsCount} metrics).`,
        );
        fetchRetentionStats();
      }
    } catch (err) {
      console.error(err);
      setPurgeMessage("Failed to execute retention purge.");
    } finally {
      setIsPurging(false);
    }
  };

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchAuditLogs(false);
      fetchRetentionStats();
    });
  }, [fetchAuditLogs, fetchRetentionStats]);

  const [slackWebhookUrl, setSlackWebhookUrl] = useState(
    project.slackWebhookUrl,
  );
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(
    project.discordWebhookUrl || "",
  );
  const [teamsWebhookUrl, setTeamsWebhookUrl] = useState(
    project.teamsWebhookUrl || "",
  );
  const [minErrorCount, setMinErrorCount] = useState(project.minErrorCount);
  const [zScoreThreshold, setZScoreThreshold] = useState(
    project.zScoreThreshold,
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSaveStatus("idle");
    setErrorMessage("");

    try {
      const res = await fetch("/api/projects/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: name.trim(),
          slackWebhookUrl: slackWebhookUrl.trim(),
          discordWebhookUrl: discordWebhookUrl.trim(),
          teamsWebhookUrl: teamsWebhookUrl.trim(),
          minErrorCount: Number(minErrorCount),
          zScoreThreshold: Number(zScoreThreshold),
        }),
      });

      if (res.ok) {
        setSaveStatus("success");
        router.refresh();
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        const data = await res.json();
        setSaveStatus("error");
        setErrorMessage(data.error?.message || "Failed to update settings");
      }
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setErrorMessage("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1.5">
          <Settings className="w-3.5 h-3.5" />
          Project Settings
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Configuration
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Configure incident detection thresholds, notification integrations,
          and access credentials.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Project Profile Section */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              General Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="projectName">Project Name</Label>
              <Input
                id="projectName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>API Ingestion Key</Label>
              <div className="flex-1 bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-xs font-mono text-slate-500 select-none truncate">
                obs_sk_••••••••••••••••••••••••••••••••
              </div>
              <p className="text-[10px] text-amber-500 mt-1.5 leading-relaxed">
                ⚠️ For security, your API ingestion key is cryptographically
                hashed inside our database and cannot be revealed or copied
                again. If you have lost your key, please create a new project to
                generate a new credentials set.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Incident Alert Threshold Settings */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
          <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-4">
            <Volume2 className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Anomaly & Alert Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl">
            {/* Minimum Error Count */}
            <div className="space-y-2">
              <Label htmlFor="minErrorCount">Min Error Trigger Limit</Label>
              <Input
                id="minErrorCount"
                type="number"
                required
                min="1"
                value={minErrorCount}
                onChange={(e) =>
                  setMinErrorCount(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Minimum number of error logs in a 5-minute sliding window
                required to evaluate for anomalies. Avoids alerting on single
                noise occurrences.
              </p>
            </div>

            {/* Z-Score Sensitivity */}
            <div className="space-y-2">
              <Label htmlFor="zScoreThreshold">
                Statistical Sensitivity (Z-Score)
              </Label>
              <Input
                id="zScoreThreshold"
                type="number"
                required
                min="1.0"
                step="0.1"
                value={zScoreThreshold}
                onChange={(e) =>
                  setZScoreThreshold(
                    Math.max(1.0, parseFloat(e.target.value) || 1.0),
                  )
                }
                className="font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Standard deviations above the historical baseline required to
                trigger an alert.
                <span className="block mt-0.5 text-slate-400">
                  Recommended: 3.0 (higher = less sensitive, lower = more
                  sensitive).
                </span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Integration settings */}
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
          <CardHeader>
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Notification Channel Webhooks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 max-w-xl">
            {/* Slack */}
            <div className="space-y-2">
              <Label htmlFor="slackWebhook">Slack Incoming Webhook URL</Label>
              <Input
                id="slackWebhook"
                type="url"
                value={slackWebhookUrl}
                onChange={(e) => setSlackWebhookUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/T000/B000/XXXX"
                className="font-mono placeholder:text-slate-700"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Pushes rich diagnostic cards to your Slack channel on incidents
                and SLO budget status transitions.
              </p>
            </div>

            {/* Discord */}
            <div className="space-y-2">
              <Label htmlFor="discordWebhook">
                Discord Incoming Webhook URL
              </Label>
              <Input
                id="discordWebhook"
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder="https://discord.com/api/webhooks/XXXX"
                className="font-mono placeholder:text-slate-700"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Pushes embeds to Discord channel webhooks on anomalies and SLO
                budget changes.
              </p>
            </div>

            {/* Microsoft Teams */}
            <div className="space-y-2">
              <Label htmlFor="teamsWebhook">Microsoft Teams Webhook URL</Label>
              <Input
                id="teamsWebhook"
                type="url"
                value={teamsWebhookUrl}
                onChange={(e) => setTeamsWebhookUrl(e.target.value)}
                placeholder="https://outlook.office.com/webhook/XXXX"
                className="font-mono placeholder:text-slate-700"
              />
              <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                Pushes Office 365 Connector cards to Microsoft Teams channel on
                alerts.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Feedback / Save Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {saveStatus === "success" && (
              <Badge
                variant="success"
                className="px-3 py-1.5 text-xs font-semibold"
              >
                <Check className="w-4 h-4 mr-1.5" />
                Settings saved successfully
              </Badge>
            )}
            {saveStatus === "error" && (
              <Badge
                variant="destructive"
                className="px-3 py-1.5 text-xs font-semibold"
              >
                <AlertTriangle className="w-4 h-4 mr-1.5" />
                {errorMessage}
              </Badge>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-500 text-white"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {isSubmitting ? "Saving changes..." : "Save Settings"}
          </Button>
        </div>
      </form>

      {/* Data Retention & Storage Lifecycle Section */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              Data Retention & Storage Lifecycle
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fetchRetentionStats()}
            className="text-slate-500 hover:text-slate-300"
            title="Refresh retention stats"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoadingRetention ? "animate-spin" : ""}`}
            />
          </Button>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          {isLoadingRetention ? (
            <div className="text-center py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              Calculating project storage retention...
            </div>
          ) : retentionStats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-500 font-medium">
                    Plan Retention Window
                  </div>
                  <div className="text-base font-bold text-white mt-1 flex items-center gap-1.5 font-mono">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    {retentionStats.retentionDays} Days
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1 capitalize">
                    {retentionStats.plan} Tier Limit
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-500 font-medium">
                    Active Storage Count
                  </div>
                  <div className="text-base font-bold text-white mt-1 font-mono">
                    {retentionStats.totalRecords.toLocaleString()} items
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    {retentionStats.totalLogs.toLocaleString()} logs ·{" "}
                    {retentionStats.totalSpans.toLocaleString()} spans ·{" "}
                    {retentionStats.totalMetrics.toLocaleString()} metrics
                  </div>
                </div>

                <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                  <div className="text-xs text-slate-500 font-medium">
                    Expired & Cleanable
                  </div>
                  <div className="text-base font-bold text-amber-400 mt-1 font-mono">
                    {retentionStats.expiredRecords.toLocaleString()} items
                  </div>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Older than{" "}
                    {new Date(
                      retentionStats.thresholdDate,
                    ).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {purgeMessage && (
                <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-300 font-medium">
                  {purgeMessage}
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-800/80">
                <p className="text-xs text-slate-500">
                  Scheduled daily cron automatically purges data older than your
                  plan retention threshold.
                </p>
                <Button
                  type="button"
                  onClick={handleManualPurge}
                  disabled={isPurging || retentionStats.expiredRecords === 0}
                  variant="outline"
                  size="sm"
                  className="border-slate-800 hover:bg-rose-500/10 hover:text-rose-400 text-xs"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                  {isPurging ? "Purging data..." : "Purge Expired Data Now"}
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Retention statistics unavailable.
            </p>
          )}
        </CardContent>
      </Card>

      {/* System & Project Audit Logs Section */}
      <Card className="relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-indigo-400" />
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
              System & Configuration Audit Logs
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fetchAuditLogs()}
            className="text-slate-500 hover:text-slate-300"
            title="Refresh logs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </CardHeader>
        <CardContent className="pt-4">
          {isLoadingAudit ? (
            <div className="text-center py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
              Loading system audit logs...
            </div>
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-slate-650 italic py-4 text-center">
              No configuration changes or SRE actions recorded yet.
            </p>
          ) : (
            <div className="border border-slate-850 rounded-lg overflow-hidden bg-slate-950/60">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-850 bg-slate-900/60 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <TableHead className="w-3/12 py-2 px-4">
                      Timestamp
                    </TableHead>
                    <TableHead className="w-2/12 py-2 px-4">User</TableHead>
                    <TableHead className="w-3/12 py-2 px-4">Action</TableHead>
                    <TableHead className="w-4/12 py-2 px-4">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-xs font-mono">
                  {auditLogs.map((log) => {
                    const dateStr = new Date(log.createdAt).toLocaleString();
                    let details = "";
                    if (log.action === "service.delete") {
                      details = `Service deleted: "${log.targetId}" (${log.metadata?.environment})`;
                    } else if (log.action === "slo.create") {
                      details = `SLO created: "${log.targetId}" (Target: ${log.metadata?.target}%)`;
                    } else if (log.action === "slo.update") {
                      details = `SLO updated: "${log.targetId}" (Target: ${log.metadata?.target}%)`;
                    } else if (log.action === "slo.delete") {
                      details = `SLO deleted: "${log.targetId}"`;
                    } else if (log.action === "webhook.update") {
                      const changes = [];
                      if (log.metadata?.slackChanged) changes.push("Slack");
                      if (log.metadata?.discordChanged) changes.push("Discord");
                      if (log.metadata?.teamsChanged) changes.push("Teams");
                      details = `Webhooks updated: ${changes.join(", ") || "none"}`;
                    } else {
                      details = `Action on ${log.targetEntity}: ${log.targetId || ""}`;
                    }

                    return (
                      <TableRow
                        key={log.id}
                        className="hover:bg-slate-900/30 transition-colors text-slate-350"
                      >
                        <TableCell className="py-2.5 px-4 text-slate-500 truncate">
                          {dateStr}
                        </TableCell>
                        <TableCell className="py-2.5 px-4 text-slate-300 font-semibold truncate">
                          {log.user?.username || "System"}
                        </TableCell>
                        <TableCell className="py-2.5 px-4">
                          <Badge
                            variant="outline"
                            className="text-[9px] font-bold border-indigo-500/20 bg-indigo-500/5 text-indigo-400 uppercase tracking-wider font-mono"
                          >
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell
                          className="py-2.5 px-4 text-slate-200 truncate max-w-50"
                          title={details}
                        >
                          {details}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
