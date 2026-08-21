"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ChevronRight,
  ChevronDown,
  Info,
  Terminal,
  Activity,
  Code2,
} from "lucide-react";

interface SpanDetail {
  id: string;
  spanId: string;
  parentSpanId: string | null;
  name: string;
  kind: string;
  serviceId: string;
  serviceName: string;
  serviceColor: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  offsetMs: number;
  startPercent: number;
  widthPercent: number;
  status: "ok" | "error" | "unset";
  statusCode?: number;
  errorMessage?: string;
  attributes: Record<string, unknown>;
  events: Array<{
    name: string;
    timestamp: string;
    attributes?: Record<string, unknown>;
  }>;
  environment: string;
}

interface LogDetail {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info" | "debug";
  message: string;
  metadata?: Record<string, unknown>;
  serviceName: string;
}

interface TraceDetail {
  traceId: string;
  rootSpan?: SpanDetail;
  totalDurationMs: number;
  startTime: string;
  endTime: string;
  spanCount: number;
  hasError: boolean;
  spans: SpanDetail[];
  logs: LogDetail[];
}

interface WaterfallViewProps {
  trace: TraceDetail;
  projectId: string;
}

export default function WaterfallView({
  trace,
  projectId,
}: WaterfallViewProps) {
  const [selectedSpan, setSelectedSpan] = useState<SpanDetail | null>(
    trace.spans[0] || null,
  );
  const [activeTab, setActiveTab] = useState<"waterfall" | "logs">("waterfall");

  // Calculate span depth / hierarchy
  const spanDepthMap = new Map<string, number>();
  const calculateDepth = (span: SpanDetail): number => {
    if (!span.parentSpanId) return 0;
    const parent = trace.spans.find((s) => s.spanId === span.parentSpanId);
    if (!parent) return 0;
    return 1 + calculateDepth(parent);
  };

  trace.spans.forEach((span) => {
    spanDepthMap.set(span.spanId, calculateDepth(span));
  });

  return (
    <div className="space-y-6">
      {/* Back Navigation & Breadcrumb */}
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/traces?projectId=${projectId}`}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Traces
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-xs font-mono text-slate-400 truncate max-w-sm">
          {trace.traceId}
        </span>
      </div>

      {/* Trace Overview Header Card */}
      <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800 backdrop-blur">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-white tracking-tight">
                {trace.rootSpan?.name || "Distributed Trace"}
              </h1>
              {trace.hasError ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Failed
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Success
                </span>
              )}
            </div>
            <p className="text-xs font-mono text-slate-400 mt-1">
              Trace ID: <span className="text-slate-300">{trace.traceId}</span>
            </p>
          </div>

          {/* Quick Metrics */}
          <div className="flex items-center gap-6 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-800 w-full lg:w-auto">
            <div>
              <div className="text-xs text-slate-500 font-medium">
                Total Duration
              </div>
              <div className="text-base font-bold font-mono text-white flex items-center gap-1.5 mt-0.5">
                <Clock className="w-4 h-4 text-indigo-400" />
                {trace.totalDurationMs >= 1000
                  ? `${(trace.totalDurationMs / 1000).toFixed(2)}s`
                  : `${trace.totalDurationMs}ms`}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <div className="text-xs text-slate-500 font-medium">Spans</div>
              <div className="text-base font-bold font-mono text-white flex items-center gap-1.5 mt-0.5">
                <Layers className="w-4 h-4 text-cyan-400" />
                {trace.spanCount}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div>
              <div className="text-xs text-slate-500 font-medium">
                Correlated Logs
              </div>
              <div className="text-base font-bold font-mono text-white flex items-center gap-1.5 mt-0.5">
                <Terminal className="w-4 h-4 text-amber-400" />
                {trace.logs.length}
              </div>
            </div>
          </div>
        </div>

        {/* View Tabs */}
        <div className="flex items-center gap-2 mt-6 border-b border-slate-800 pt-2">
          <button
            onClick={() => setActiveTab("waterfall")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === "waterfall"
                ? "border-indigo-500 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-4 h-4" />
            Waterfall Timeline ({trace.spans.length})
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition ${
              activeTab === "logs"
                ? "border-indigo-500 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <Terminal className="w-4 h-4" />
            Correlated Logs ({trace.logs.length})
          </button>
        </div>
      </div>

      {activeTab === "waterfall" ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left / Center: Waterfall Tree */}
          <div className="lg:col-span-2 bg-slate-900/40 rounded-xl border border-slate-800 p-4 space-y-4 overflow-hidden">
            {/* Timeline Header Scale */}
            <div className="grid grid-cols-12 text-xs font-mono text-slate-500 border-b border-slate-800 pb-2 px-2">
              <div className="col-span-5 text-slate-400 font-sans font-medium">
                Operation / Service
              </div>
              <div className="col-span-7 flex justify-between">
                <span>0ms</span>
                <span>{(trace.totalDurationMs * 0.25).toFixed(0)}ms</span>
                <span>{(trace.totalDurationMs * 0.5).toFixed(0)}ms</span>
                <span>{(trace.totalDurationMs * 0.75).toFixed(0)}ms</span>
                <span>{trace.totalDurationMs}ms</span>
              </div>
            </div>

            {/* Waterfall Rows */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
              {trace.spans.map((span) => {
                const depth = spanDepthMap.get(span.spanId) || 0;
                const isSelected = selectedSpan?.spanId === span.spanId;

                return (
                  <div
                    key={span.id}
                    onClick={() => setSelectedSpan(span)}
                    className={`grid grid-cols-12 items-center p-2 rounded-lg cursor-pointer transition text-xs ${
                      isSelected
                        ? "bg-indigo-950/40 border border-indigo-500/40"
                        : "hover:bg-slate-800/40 border border-transparent"
                    }`}
                  >
                    {/* Span Operation info */}
                    <div
                      className="col-span-5 flex items-center gap-2 truncate pr-2"
                      style={{ paddingLeft: `${depth * 16}px` }}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            span.status === "error"
                              ? "#f43f5e"
                              : span.serviceColor || "#6366f1",
                        }}
                      />
                      <span className="font-semibold text-white truncate">
                        {span.name}
                      </span>
                      <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded shrink-0">
                        {span.serviceName}
                      </span>
                    </div>

                    {/* Timeline Bar */}
                    <div className="col-span-7 relative h-6 bg-slate-950/60 rounded flex items-center px-1">
                      <div
                        className={`h-4 rounded transition-all flex items-center justify-end px-1.5 text-[10px] font-mono font-semibold ${
                          span.status === "error"
                            ? "bg-rose-500/80 text-white"
                            : "bg-indigo-500/80 hover:bg-indigo-400 text-white"
                        }`}
                        style={{
                          marginLeft: `${span.startPercent}%`,
                          width: `${span.widthPercent}%`,
                          minWidth: "28px",
                        }}
                      >
                        <span className="truncate">{span.durationMs}ms</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Span Inspector Drawer */}
          <div className="bg-slate-900/40 rounded-xl border border-slate-800 p-5 space-y-5">
            {selectedSpan ? (
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-wider font-semibold text-indigo-400">
                      Span Details
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-medium ${
                        selectedSpan.status === "error"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {selectedSpan.status.toUpperCase()}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {selectedSpan.name}
                  </h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Service:{" "}
                    <span className="text-slate-200 font-medium">
                      {selectedSpan.serviceName}
                    </span>{" "}
                    ({selectedSpan.environment})
                  </div>
                </div>

                {/* Timing Metrics */}
                <div className="grid grid-cols-2 gap-3 bg-slate-950 p-3 rounded-lg border border-slate-800/80 text-xs font-mono">
                  <div>
                    <div className="text-slate-500">Duration</div>
                    <div className="text-white font-bold mt-0.5">
                      {selectedSpan.durationMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Start Offset</div>
                    <div className="text-white font-bold mt-0.5">
                      +{selectedSpan.offsetMs} ms
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Span ID</div>
                    <div className="text-slate-300 truncate mt-0.5">
                      {selectedSpan.spanId}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Parent Span ID</div>
                    <div className="text-slate-300 truncate mt-0.5">
                      {selectedSpan.parentSpanId || "None (Root)"}
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {selectedSpan.errorMessage && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs text-rose-300 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5 text-rose-400">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Span Error
                    </div>
                    <div className="font-mono">{selectedSpan.errorMessage}</div>
                  </div>
                )}

                {/* Attributes Table */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-indigo-400" />
                    Attributes
                  </h4>
                  {Object.keys(selectedSpan.attributes).length === 0 ? (
                    <div className="text-xs text-slate-500 italic">
                      No custom attributes recorded.
                    </div>
                  ) : (
                    <div className="bg-slate-950 rounded-lg border border-slate-800 overflow-hidden divide-y divide-slate-800 text-xs font-mono max-h-48 overflow-y-auto">
                      {Object.entries(selectedSpan.attributes).map(
                        ([key, val]) => (
                          <div
                            key={key}
                            className="p-2 flex justify-between gap-2"
                          >
                            <span className="text-indigo-300 truncate">
                              {key}
                            </span>
                            <span className="text-slate-300 text-right truncate">
                              {typeof val === "object"
                                ? JSON.stringify(val)
                                : String(val)}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-slate-500 text-xs">
                Select a span from the waterfall timeline to inspect.
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Correlated Logs Tab */
        <div className="bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">
          {trace.logs.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No logs associated with this traceId.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 font-mono text-xs max-h-[600px] overflow-y-auto">
              {trace.logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 hover:bg-slate-800/30 transition flex items-start gap-3"
                >
                  <span className="text-slate-500 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${
                      log.level === "error"
                        ? "bg-rose-500/15 text-rose-400"
                        : log.level === "warn"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {log.level}
                  </span>
                  <span className="text-indigo-400 shrink-0">
                    [{log.serviceName}]
                  </span>
                  <span className="text-slate-200 break-all">
                    {log.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
