"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Network,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from "lucide-react";

interface SerializedService {
  id: string;
  name: string;
  environment: string;
}

interface TraceItem {
  traceId: string;
  rootSpanName: string;
  serviceId: string;
  serviceName: string;
  environment: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  spanCount: number;
  status: "ok" | "error";
  serviceCount: number;
}

interface TracesViewProps {
  initialTraces: TraceItem[];
  services: SerializedService[];
  projectId: string;
}

export default function TracesView({
  initialTraces,
  services,
  projectId,
}: TracesViewProps) {
  const [traces, setTraces] = useState<TraceItem[]>(initialTraces);
  const [selectedService, setSelectedService] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("24h");
  const [hideNoise, setHideNoise] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const fetchTraces = useCallback(
    async (overrideHideNoise?: boolean) => {
      setIsLoading(true);
      try {
        const noiseSetting =
          overrideHideNoise !== undefined ? overrideHideNoise : hideNoise;
        const params = new URLSearchParams({
          projectId,
          serviceId: selectedService,
          status: selectedStatus,
          timeRange,
          hideNoise: noiseSetting ? "true" : "false",
        });

        const res = await fetch(`/api/traces?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setTraces(data.traces || []);
        }
      } catch (err) {
        console.error("Failed to load traces:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, selectedService, selectedStatus, timeRange, hideNoise],
  );

  const handleFilter = () => {
    fetchTraces();
  };

  const toggleHideNoise = () => {
    const next = !hideNoise;
    setHideNoise(next);
    fetchTraces(next);
  };

  const filteredTraces = traces.filter((t) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.traceId.toLowerCase().includes(q) ||
      t.rootSpanName.toLowerCase().includes(q) ||
      t.serviceName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/50 p-6 rounded-xl border border-slate-800 backdrop-blur">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">
                APM Distributed Tracing
              </h1>
              <p className="text-sm text-slate-400">
                Explore end-to-end request trees, cross-service waterfall
                timelines, and latency bottlenecks.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleHideNoise}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition cursor-pointer ${
              hideNoise
                ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/30 shadow-xs"
                : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
            }`}
            title="Automatically filter out /ping, /health, /healthz, /metrics, and probe noise"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {hideNoise ? "Noise Filter: Active" : "Noise Filter: Off"}
          </button>
          <button
            onClick={handleFilter}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
        {/* Search */}
        <div className="relative lg:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="Search by Trace ID, root operation, or service..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Service filter */}
        <div>
          <select
            value={selectedService}
            onChange={(e) => {
              setSelectedService(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Services</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.environment})
              </option>
            ))}
          </select>
        </div>

        {/* Status filter */}
        <div>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="ok">Success (OK)</option>
            <option value="error">Has Errors</option>
          </select>
        </div>

        {/* Time filter */}
        <div>
          <select
            value={timeRange}
            onChange={(e) => {
              setTimeRange(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500 cursor-pointer"
          >
            <option value="1h">Last 1 Hour</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>
        </div>
      </div>

      {/* Traces Table / List */}
      <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">
        {filteredTraces.length === 0 ? (
          <div className="py-16 text-center">
            <Layers className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <h3 className="text-base font-medium text-slate-300">
              No distributed traces found
            </h3>
            <p className="text-sm text-slate-500 max-w-md mx-auto mt-1">
              Ship spans using{" "}
              <code className="text-indigo-400">@observability-os/sdk</code> or
              send OpenTelemetry spans to{" "}
              <code className="text-indigo-400">/api/traces/ingest</code>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-slate-400 text-xs uppercase font-medium border-b border-slate-800">
                <tr>
                  <th className="px-5 py-3">Root Operation / Trace ID</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Duration</th>
                  <th className="px-5 py-3">Spans</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Timestamp</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredTraces.map((t) => (
                  <tr
                    key={t.traceId}
                    className="hover:bg-slate-800/40 transition group"
                  >
                    <td className="px-5 py-4">
                      <div className="font-semibold text-white group-hover:text-indigo-400 transition">
                        {t.rootSpanName}
                      </div>
                      <div className="text-xs font-mono text-slate-500 truncate max-w-xs">
                        {t.traceId}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {t.serviceName}
                        {t.serviceCount > 1 && (
                          <span className="text-indigo-400 font-mono">
                            +{t.serviceCount - 1} services
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 text-slate-300 font-mono text-xs">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {t.durationMs >= 1000
                          ? `${(t.durationMs / 1000).toFixed(2)}s`
                          : `${t.durationMs}ms`}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-300 font-mono text-xs">
                      {t.spanCount} spans
                    </td>
                    <td className="px-5 py-4">
                      {t.status === "error" ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Error
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          OK
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {new Date(t.startTime).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={`/dashboard/traces/${t.traceId}?projectId=${projectId}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-300 hover:text-white bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition"
                      >
                        Waterfall
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
