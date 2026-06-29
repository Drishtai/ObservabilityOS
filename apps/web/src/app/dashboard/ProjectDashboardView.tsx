"use client";

import { useState, useSyncExternalStore } from "react";
import { format, formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Plus,
  Terminal,
  Activity,
  Server,
  Layers,
  Calendar,
  GitBranch,
  GitCommit,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface SerializedService {
  id: string;
  name: string;
  environment: "prod" | "staging" | "dev";
  createdAt: string;
  totalLogs: number;
  errorRate: number;
  availability: number;
  avgLatency: number | null;
  healthStatus: "healthy" | "warning" | "incident";
}

export interface SerializedDeployment {
  id: string;
  serviceId: string;
  serviceName: string;
  commitSha: string;
  commitMessage: string;
  branch: string;
  environment: "prod" | "staging" | "dev";
  deployedAt: string | null;
}

interface ProjectDashboardViewProps {
  project: {
    id: string;
    name: string;
    apiKey: string;
  };
  services: SerializedService[];
  deployments: SerializedDeployment[];
}

function formatDate(dateString: string) {
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "N/A";
    return format(d, "yyyy-MM-dd");
  } catch {
    return "N/A";
  }
}

function timeAgo(dateString: string | null) {
  if (!dateString) return "N/A";
  try {
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return "N/A";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "N/A";
  }
}

const subscribe = () => () => {};

export default function ProjectDashboardView({
  project,
  services,
  deployments = [],
}: ProjectDashboardViewProps) {
  const router = useRouter();
  const isMounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [showKey, setShowKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [serviceName, setServiceName] = useState("");
  const [environment, setEnvironment] = useState<"prod" | "staging" | "dev">(
    "dev",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sdkTab, setSdkTab] = useState<"basic" | "multi" | "deploy">("basic");

  const endpointUrl =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.host}/api/ingest`
      : `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ingest`;

  const handleCopyKey = () => {
    navigator.clipboard.writeText(project.apiKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(endpointUrl);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceName.trim()) return;

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          name: serviceName.trim(),
          environment,
        }),
      });

      if (res.ok) {
        setServiceName("");
        setEnvironment("dev");
        setIsModalOpen(false);
        router.refresh();
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to create service");
      }
    } catch (e) {
      console.error(e);
      alert("An unexpected error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-10">
      {/* Page Title & Ingestion Card */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              {project.name}
            </h1>
            <p className="text-sm text-slate-400">
              Configure client SDK and manage services for this project.
            </p>
          </div>

          {/* Credentials Card */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent pointer-events-none" />
            <CardHeader className="pb-4">
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-400">
                Ingestion Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Endpoint URL */}
              <div className="space-y-2">
                <Label>Ingestion Endpoint</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all truncate">
                    {endpointUrl}
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopyUrl}
                    className="shrink-0"
                  >
                    {copiedUrl ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* API Key */}
              <div className="space-y-2">
                <Label>API Ingestion Key</Label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 select-all truncate flex items-center justify-between">
                    <span>
                      {showKey
                        ? project.apiKey
                        : "••••••••••••••••••••••••••••••••••••••••••••••••"}
                    </span>
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="text-slate-500 hover:text-slate-300 ml-2 cursor-pointer"
                    >
                      {showKey ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopyKey}
                    className="shrink-0"
                  >
                    {copiedKey ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                  ℹ️ For security, your key is cryptographically hashed in our database. The original plain key is not shown again, but this hashed key is fully valid and can be copied and used for ingestion.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Integration card */}
        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-slate-800/60">
            <div className="flex items-center gap-2 text-indigo-400">
              <Terminal className="w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider">
                SDK Setup
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 flex flex-col justify-between">
            <Tabs
              value={sdkTab}
              onValueChange={(val) =>
                setSdkTab(val as "basic" | "multi" | "deploy")
              }
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="multi">Multi</TabsTrigger>
                <TabsTrigger value="deploy">Git Deploy</TabsTrigger>
              </TabsList>

              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                {sdkTab === "basic"
                  ? "Install the SDK and configure a default service name to start routing logs:"
                  : sdkTab === "multi"
                    ? "Override the service per log or instantiate separate loggers for different components:"
                    : "Notify ObservabilityOS of new releases to correlate errors with deployments:"}
              </p>

              <TabsContent value="basic" className="mt-0">
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-indigo-300 whitespace-pre-wrap break-all mb-4 select-all">
                  {`import { Logger } from "@observability-os/sdk";

const logger = new Logger({
  apiKey: "${project.apiKey.slice(0, 10)}...",
  endpoint: "${endpointUrl}",
  // Required default service name
  defaultService: "main-api"
});

logger.info("Service started successfully");`}
                </pre>
              </TabsContent>

              <TabsContent value="multi" className="mt-0">
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-indigo-300 whitespace-pre-wrap break-all mb-4 select-all">
                  {`import { Logger } from "@observability-os/sdk";

const logger = new Logger({
  apiKey: "${project.apiKey.slice(0, 10)}...",
  endpoint: "${endpointUrl}",
  defaultService: "main-api"
});

// 1. Override service dynamically:
logger.info("Order processed", {
  service: "payment-service",
  metadata: { amount: 99.99 }
});

// 2. Or create a dedicated instance:
const authLogger = new Logger({
  apiKey: "${project.apiKey.slice(0, 10)}...",
  defaultService: "auth-service"
});`}
                </pre>
              </TabsContent>

              <TabsContent value="deploy" className="mt-0">
                <pre className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-indigo-300 whitespace-pre-wrap break-all mb-4 select-all">
                  {`# Send release webhook in CI/CD pipeline:
curl -X POST "${endpointUrl.replace("/api/ingest", "/api/webhooks/github")}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${project.apiKey.slice(0, 10)}..." \\
  -d '{
    "service": "main-api",
    "environment": "prod",
    "commitSha": "sha256...",
    "commitMessage": "Release production v1.0",
    "branch": "main"
  }'`}
                </pre>
              </TabsContent>
            </Tabs>
            <span className="text-[10px] text-slate-500">
              {sdkTab === "deploy"
                ? "Ensure the commit SHA is passed when deploying."
                : "For monorepo projects, run "}
              <code className="font-mono text-slate-400">
                {sdkTab === "deploy"
                  ? "POST /api/webhooks/github"
                  : "yarn add @observability-os/sdk"}
              </code>
              .
            </span>
          </CardContent>
        </Card>
      </section>

      {/* Services List Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-900 pb-4">
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">Monitored Services</h2>
            <Badge variant="secondary">{services.length}</Badge>
          </div>

          <Button
            id="add_service_btn"
            size="sm"
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
          >
            <Plus className="w-4 h-4" />
            Add Service
          </Button>
        </div>

        {services.length === 0 ? (
          <Card className="border-dashed py-12 text-center max-w-2xl mx-auto">
            <CardContent className="flex flex-col items-center">
              <Layers className="w-10 h-10 text-slate-600 mb-4" />
              <h3 className="text-sm font-bold text-slate-300 mb-1">
                No services registered
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed mb-6">
                Services are automatically registered as logs are ingested, or
                you can register your service names manually beforehand.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Register Service Manually
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {services.map((service) => {
              const healthColors = {
                healthy: {
                  bg: "bg-emerald-500",
                  ping: "bg-emerald-400",
                  text: "text-emerald-400",
                  label: "Healthy",
                  badge: "success" as const,
                },
                warning: {
                  bg: "bg-amber-500",
                  ping: "bg-amber-400",
                  text: "text-amber-400",
                  label: "Warning",
                  badge: "warning" as const,
                },
                incident: {
                  bg: "bg-rose-500",
                  ping: "bg-rose-400",
                  text: "text-rose-400",
                  label: "Incident",
                  badge: "destructive" as const,
                },
              };
              const health =
                healthColors[service.healthStatus] || healthColors.healthy;

              return (
                <Card
                  key={service.id}
                  onClick={() =>
                    router.push(
                      `/dashboard/services/${service.id}?projectId=${project.id}`,
                    )
                  }
                  className="bg-slate-900/50 border border-slate-900 hover:border-indigo-500/40 transition-all duration-200 cursor-pointer hover:bg-slate-900/80 group"
                >
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="relative flex h-2 w-2 shrink-0">
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${health.ping}`}
                          />
                          <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${health.bg}`}
                          />
                        </span>
                        <h3 className="text-sm font-bold text-white truncate max-w-32.5 group-hover:text-indigo-400 transition-colors">
                          {service.name}
                        </h3>
                      </div>
                      <Badge
                        variant={
                          service.environment === "prod"
                            ? "destructive"
                            : service.environment === "staging"
                              ? "warning"
                              : "success"
                        }
                      >
                        {service.environment}
                      </Badge>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-3 gap-2 border-t border-b border-slate-800/60 py-3 mb-3">
                      <div className="text-center">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Uptime
                        </span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            service.totalLogs === 0
                              ? "text-slate-400"
                              : service.availability >= 99
                                ? "text-emerald-400"
                                : service.availability >= 95
                                  ? "text-amber-400"
                                  : "text-rose-400"
                          }`}
                        >
                          {service.totalLogs === 0
                            ? "100.0%"
                            : `${service.availability.toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="text-center border-l border-r border-slate-800/60">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Error Rate
                        </span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            service.totalLogs === 0
                              ? "text-slate-400"
                              : service.errorRate > 5
                                ? "text-rose-400"
                                : service.errorRate > 1
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                          }`}
                        >
                          {service.totalLogs === 0
                            ? "0.0%"
                            : `${service.errorRate.toFixed(1)}%`}
                        </span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">
                          Avg Latency
                        </span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            service.avgLatency === null
                              ? "text-slate-500"
                              : service.avgLatency > 500
                                ? "text-rose-400"
                                : service.avgLatency > 200
                                  ? "text-amber-400"
                                  : "text-emerald-400"
                          }`}
                        >
                          {service.avgLatency === null
                            ? "—"
                            : `${service.avgLatency}ms`}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-2.5 text-xs text-slate-500">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Created: {formatDate(service.createdAt)}</span>
                        </div>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {service.totalLogs} logs
                        </span>
                      </div>

                      {service.totalLogs === 0 ? (
                        <div className="flex items-center gap-2 text-slate-500 text-[11px] font-medium bg-slate-950/40 border border-slate-900/60 rounded px-2 py-1">
                          <Activity className="w-3.5 h-3.5 text-slate-600" />
                          <span>Awaiting incoming streams</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[11px] font-semibold bg-slate-950/60 border border-slate-900 rounded px-2 py-1 justify-between">
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
                            <span className={health.text}>{health.label}</span>
                          </div>
                          <span className="text-[10px] text-slate-500 font-normal">
                            Active streams
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Releases & Deployments Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-900 pb-4">
          <div className="flex items-center gap-3">
            <GitBranch className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white">
              Recent Releases & Deployments
            </h2>
            <Badge variant="secondary">{deployments.length}</Badge>
          </div>
        </div>

        {deployments.length === 0 ? (
          <Card className="border-dashed py-12 text-center max-w-2xl mx-auto">
            <CardContent className="flex flex-col items-center">
              <GitCommit className="w-10 h-10 text-slate-600 mb-4" />
              <h3 className="text-sm font-bold text-slate-300 mb-1">
                No tracked deployments
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Log code deployments in your CI/CD pipeline to immediately
                correlate error spikes and latency regressions with code
                changes.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-slate-800">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-slate-900 bg-slate-950 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                    <TableHead className="py-3 px-4">
                      Release Commit / Branch
                    </TableHead>
                    <TableHead className="py-3 px-4">Service</TableHead>
                    <TableHead className="py-3 px-4">Environment</TableHead>
                    <TableHead className="py-3 px-4 text-right">
                      Deployed At
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deployments.map((deploy) => (
                    <TableRow key={deploy.id}>
                      <TableCell className="py-3.5 px-4 font-sans">
                        <div className="flex flex-col gap-0.5 max-w-xs md:max-w-md lg:max-w-xl">
                          <span className="font-semibold text-slate-200 truncate">
                            {deploy.commitMessage}
                          </span>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                            <span className="bg-slate-900 px-1.5 py-0.5 rounded border border-slate-850/60 text-slate-400">
                              {deploy.commitSha.slice(0, 7)}
                            </span>
                            <span className="flex items-center gap-1">
                              <GitBranch className="w-3 h-3 text-slate-600" />
                              {deploy.branch}
                            </span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-3.5 px-4 font-mono font-semibold text-slate-300">
                        {deploy.serviceName}
                      </TableCell>
                      <TableCell className="py-3.5 px-4">
                        <Badge
                          variant={
                            deploy.environment === "prod"
                              ? "destructive"
                              : deploy.environment === "staging"
                                ? "warning"
                                : "success"
                          }
                        >
                          {deploy.environment}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3.5 px-4 text-right text-slate-400 font-medium">
                        <div className="flex flex-col items-end font-sans">
                          <span>
                            {isMounted ? timeAgo(deploy.deployedAt) : "—"}
                          </span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            {isMounted && deploy.deployedAt
                              ? new Date(deploy.deployedAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )
                              : ""}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>

      {/* Register Service Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Register Service</DialogTitle>
            <DialogDescription>
              Establish a new target service environment for your log streams.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateService}>
            <div className="space-y-4 my-4">
              <div className="space-y-2">
                <Label htmlFor="serviceName">Service Name</Label>
                <Input
                  id="serviceName"
                  type="text"
                  required
                  value={serviceName}
                  onChange={(e) => setServiceName(e.target.value)}
                  placeholder="e.g. payment-gateway"
                />
              </div>

              <div className="space-y-2">
                <Label>Environment</Label>
                <div className="grid grid-cols-3 gap-3">
                  {["dev", "staging", "prod"].map((env) => (
                    <Button
                      key={env}
                      type="button"
                      variant={environment === env ? "default" : "secondary"}
                      size="sm"
                      onClick={() =>
                        setEnvironment(env as "prod" | "staging" | "dev")
                      }
                      className="capitalize"
                    >
                      {env}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                id="create_service_submit"
                type="submit"
                size="sm"
                disabled={isSubmitting}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                {isSubmitting ? "Registering..." : "Register Service"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
