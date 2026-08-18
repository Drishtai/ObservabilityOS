import { useState, useMemo } from "react";
import NextLink from "next/link";
import {
  Search,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  Filter,
  Sparkles,
  Activity,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SerializedService {
  id: string;
  name: string;
  environment: string;
}

interface SerializedIncident {
  id: string;
  title: string;
  summary: string;
  rootCause: string;
  impact: string;
  suggestedFix: string[];
  confidence: number;
  status: "open" | "investigating" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  ttd: number;
  ttr: number | null;
  service: {
    id: string;
    name: string;
    environment: string;
  } | null;
  deploy: {
    id: string;
    commitSha: string;
    commitMessage: string;
    branch: string;
  } | null;
}

interface RawIncident {
  _id: string;
  title: string;
  summary: string;
  rootCause: string;
  impact: string;
  suggestedFix: string[];
  confidence: number;
  status: "open" | "investigating" | "resolved";
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
  ttd: number;
  ttr?: number | null;
  serviceId?: {
    _id: string;
    name: string;
    environment: string;
  } | null;
  deployId?: {
    _id: string;
    commitSha: string;
    commitMessage: string;
    branch: string;
  } | null;
}

interface IncidentsViewProps {
  project: {
    id: string;
    name: string;
    apiKey: string;
  };
  services: SerializedService[];
  initialIncidents: SerializedIncident[];
}

export default function IncidentsView({
  project,
  services,
  initialIncidents,
}: IncidentsViewProps) {
  const [incidents, setIncidents] =
    useState<SerializedIncident[]>(initialIncidents);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Sync / refresh logic
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/incidents?projectId=${project.id}`);
      if (res.ok) {
        const data = await res.json();
        const formattedIncidents = data.incidents.map((inc: RawIncident) => {
          return {
            id: inc._id.toString(),
            title: inc.title,
            summary: inc.summary,
            rootCause: inc.rootCause,
            impact: inc.impact,
            suggestedFix: inc.suggestedFix,
            confidence: inc.confidence,
            status: inc.status,
            createdAt: new Date(inc.createdAt).toISOString(),
            updatedAt: new Date(inc.updatedAt).toISOString(),
            resolvedAt: inc.resolvedAt
              ? new Date(inc.resolvedAt).toISOString()
              : null,
            ttd: inc.ttd,
            ttr: inc.ttr || null,
            service: inc.serviceId
              ? {
                  id: inc.serviceId._id.toString(),
                  name: inc.serviceId.name,
                  environment: inc.serviceId.environment,
                }
              : null,
            deploy: inc.deployId
              ? {
                  id: inc.deployId._id.toString(),
                  commitSha: inc.deployId.commitSha,
                  commitMessage: inc.deployId.commitMessage,
                  branch: inc.deployId.branch,
                }
              : null,
          };
        });
        setIncidents(formattedIncidents);
      }
    } catch (e) {
      console.error("Failed to refresh incidents:", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      const matchesSearch =
        inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inc.summary.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus =
        statusFilter === "all" || inc.status === statusFilter;

      const matchesService =
        serviceFilter === "all" ||
        (inc.service && inc.service.name === serviceFilter);

      return matchesSearch && matchesStatus && matchesService;
    });
  }, [incidents, searchQuery, statusFilter, serviceFilter]);

  const openCount = useMemo(() => {
    return incidents.filter((inc) => inc.status !== "resolved").length;
  }, [incidents]);

  const totalIncidents = filteredIncidents.length;
  const totalPages = Math.max(1, Math.ceil(totalIncidents / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const handleServiceChange = (val: string) => {
    setServiceFilter(val);
    setCurrentPage(1);
  };

  const handleStatusChange = (val: string) => {
    setStatusFilter(val);
    setCurrentPage(1);
  };

  const handlePageSizeChange = (val: string) => {
    setPageSize(Number(val));
    setCurrentPage(1);
  };

  const paginatedIncidents = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredIncidents.slice(startIdx, startIdx + pageSize);
  }, [filteredIncidents, safeCurrentPage, pageSize]);

  const startItem = totalIncidents === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalIncidents);

  // Generate pagination items with smart ellipsis
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (safeCurrentPage <= 4) {
      pages.push(1, 2, 3, 4, 5, "...", totalPages);
    } else if (safeCurrentPage >= totalPages - 3) {
      pages.push(
        1,
        "...",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      );
    } else {
      pages.push(
        1,
        "...",
        safeCurrentPage - 1,
        safeCurrentPage,
        safeCurrentPage + 1,
        "...",
        totalPages,
      );
    }
    return pages;
  }, [totalPages, safeCurrentPage]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== safeCurrentPage) {
      setCurrentPage(page);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1.5">
            <Activity className="w-3.5 h-3.5 animate-pulse" />
            AI Intelligence Layer
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Incident Console
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Review and investigate anomalies detected by the statistical engine
            and parsed by AI.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {openCount > 0 ? (
            <Badge
              variant="destructive"
              className="px-3 py-1.5 text-xs font-bold"
            >
              <AlertCircle className="w-4 h-4 mr-1.5 text-rose-450" />
              {openCount} Active {openCount === 1 ? "Incident" : "Incidents"}
            </Badge>
          ) : (
            <Badge variant="success" className="px-3 py-1.5 text-xs font-bold">
              <CheckCircle2 className="w-4 h-4 mr-1.5 text-emerald-450" />
              All Systems Operational
            </Badge>
          )}

          <Button
            variant="secondary"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0"
            title="Refresh Incidents"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="p-4 rounded-xl border border-slate-900 bg-slate-950/70 backdrop-blur-sm flex flex-col md:flex-row md:items-center gap-4">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <Input
            type="text"
            placeholder="Search incidents by symptom or title..."
            value={searchQuery}
            onChange={handleSearchChange}
            className="pl-10"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Service filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <Select
              value={serviceFilter}
              onValueChange={handleServiceChange}
            >
              <SelectTrigger className="w-40 text-xs">
                <SelectValue placeholder="All Services" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {Array.from(new Set(services.map((s) => s.name))).map(
                  (serviceName) => (
                    <SelectItem key={serviceName} value={serviceName}>
                      {serviceName}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={handleStatusChange}
          >
            <SelectTrigger className="w-36 text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Count & Items per Page Header Bar */}
      {totalIncidents > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-white">{startItem}–{endItem}</strong> of{" "}
              <strong className="text-white">{totalIncidents}</strong> incidents
            </span>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <span className="text-slate-500">Per page:</span>
            <Select
              value={pageSize.toString()}
              onValueChange={handlePageSizeChange}
            >
              <SelectTrigger className="w-20 h-7 text-xs bg-slate-900 border-slate-800">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="25">25</SelectItem>
                <SelectItem value="50">50</SelectItem>
                <SelectItem value="100">100</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Incidents List */}
      {filteredIncidents.length === 0 ? (
        <Card className="relative overflow-hidden border-dashed py-12 text-center flex flex-col items-center justify-center min-h-75">
          <div className="absolute inset-0 bg-linear-to-b from-indigo-500/5 to-transparent pointer-events-none" />
          <CardContent className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-center mb-4 text-slate-500 shadow-inner">
              <CheckCircle2 className="w-6 h-6 text-indigo-500/60" />
            </div>
            <h3 className="text-base font-bold text-white mb-1.5">
              No Incidents Found
            </h3>
            <p className="text-slate-500 text-sm max-w-sm">
              Everything looks completely quiet. There are no active anomalies
              or incident reports matching your filter configuration.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            {paginatedIncidents.map((inc) => {
              const dateVal = new Date(inc.createdAt).toLocaleString();
              const badgeVariant =
                inc.status === "open"
                  ? ("destructive" as const)
                  : inc.status === "investigating"
                    ? ("warning" as const)
                    : ("success" as const);

              return (
                <Card
                  key={inc.id}
                  className="group relative rounded-xl border border-slate-905 bg-slate-950 hover:border-slate-800/80 transition-all duration-200"
                >
                  {/* Visual Accent for Open Incidents */}
                  {inc.status !== "resolved" && (
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-0.75 rounded-l-xl ${
                        inc.status === "open" ? "bg-rose-500" : "bg-amber-500"
                      }`}
                    />
                  )}

                  <CardContent className="p-5 md:p-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
                    <div className="space-y-3 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        {/* Status Pill */}
                        <Badge variant={badgeVariant} className="capitalize">
                          {inc.status}
                        </Badge>

                        {/* Service & Env Pill */}
                        <Badge variant="outline">
                          {inc.service
                            ? `${inc.service.name} • ${inc.service.environment.toUpperCase()}`
                            : "unknown service"}
                        </Badge>

                        {/* AI Tag */}
                        <Badge
                          variant="secondary"
                          className="text-indigo-400 border border-indigo-500/15 flex items-center gap-1"
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          AI Summary ({Math.round(inc.confidence * 100)}%)
                        </Badge>
                      </div>

                      {/* Incident Title */}
                      <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors truncate">
                        {inc.title}
                      </h3>

                      {/* Summary Snippet */}
                      <p className="text-slate-400 text-sm line-clamp-2 leading-relaxed">
                        {inc.summary}
                      </p>

                      <div className="flex items-center gap-4 pt-1.5 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          Detected {dateVal}
                        </span>
                        {inc.ttr && (
                          <span className="flex items-center gap-1.5 text-emerald-500/80">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500/80" />
                            Resolved in {Math.round(inc.ttr / 1000 / 60)}m
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center self-end md:self-center shrink-0">
                      <Button asChild variant="secondary" size="sm">
                        <NextLink
                          href={`/dashboard/incidents/${inc.id}?projectId=${project.id}`}
                          className="flex items-center gap-1.5"
                        >
                          Investigate
                          <ArrowRight className="w-3.5 h-3.5 text-indigo-500 group-hover:translate-x-0.5 transition-transform" />
                        </NextLink>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination Navigation Controls */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 rounded-xl border border-slate-900 bg-slate-950/70 backdrop-blur-sm mt-6">
              <div className="text-xs text-slate-400">
                Page <strong className="text-white">{safeCurrentPage}</strong> of{" "}
                <strong className="text-white">{totalPages}</strong>
              </div>

              <div className="flex items-center gap-1">
                {/* First Page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="w-8 h-8 text-xs border-slate-800 bg-slate-900/50 hover:bg-slate-800 disabled:opacity-30"
                  onClick={() => handlePageChange(1)}
                  disabled={safeCurrentPage === 1}
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </Button>

                {/* Prev Page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="w-8 h-8 text-xs border-slate-800 bg-slate-900/50 hover:bg-slate-800 disabled:opacity-30"
                  onClick={() => handlePageChange(safeCurrentPage - 1)}
                  disabled={safeCurrentPage === 1}
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 mx-1">
                  {pageNumbers.map((page, idx) => {
                    if (typeof page === "string") {
                      return (
                        <span
                          key={`ellipsis-${idx}`}
                          className="px-1.5 text-xs text-slate-600 select-none"
                        >
                          ...
                        </span>
                      );
                    }

                    const isCurrent = page === safeCurrentPage;
                    return (
                      <Button
                        key={`page-${page}`}
                        variant={isCurrent ? "default" : "outline"}
                        size="icon"
                        className={`w-8 h-8 text-xs ${
                          isCurrent
                            ? "bg-indigo-600 text-white font-bold hover:bg-indigo-500 shadow-md shadow-indigo-500/20"
                            : "border-slate-800 bg-slate-900/50 text-slate-300 hover:bg-slate-800"
                        }`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </Button>
                    );
                  })}
                </div>

                {/* Next Page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="w-8 h-8 text-xs border-slate-800 bg-slate-900/50 hover:bg-slate-800 disabled:opacity-30"
                  onClick={() => handlePageChange(safeCurrentPage + 1)}
                  disabled={safeCurrentPage === totalPages}
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                {/* Last Page */}
                <Button
                  variant="outline"
                  size="icon"
                  className="w-8 h-8 text-xs border-slate-800 bg-slate-900/50 hover:bg-slate-800 disabled:opacity-30"
                  onClick={() => handlePageChange(totalPages)}
                  disabled={safeCurrentPage === totalPages}
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

