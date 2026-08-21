"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  AlertOctagon,
  Search,
  Network,
  Terminal,
  CreditCard,
  Settings,
} from "lucide-react";

interface ProjectItem {
  id: string;
  name: string;
  apiKey: string;
}

interface SidebarNavListProps {
  projects: ProjectItem[];
  onCloseMobile?: () => void;
  isSelfHost: boolean;
}

export default function SidebarNavList({
  projects,
  onCloseMobile,
  isSelfHost,
}: SidebarNavListProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeProjectId = searchParams.get("projectId") || projects[0]?.id;

  const handleLinkClick = () => {
    if (onCloseMobile) {
      onCloseMobile();
    }
  };

  return (
    <nav className="flex-1 px-4 py-6 space-y-1">
      <Link
        id="nav_overview"
        href={
          activeProjectId
            ? `/dashboard?projectId=${activeProjectId}`
            : "/dashboard"
        }
        onClick={handleLinkClick}
        className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
          pathname === "/dashboard"
            ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
            : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
        }`}
      >
        <LayoutDashboard className="w-4 h-4 text-indigo-400" />
        Overview
      </Link>

      {projects.length > 0 ? (
        <>
          <Link
            id="nav_incidents"
            href={
              activeProjectId
                ? `/dashboard/incidents?projectId=${activeProjectId}`
                : "/dashboard/incidents"
            }
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith("/dashboard/incidents")
                ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <AlertOctagon className="w-4 h-4 text-indigo-400" />
            Incidents
          </Link>

          <Link
            id="nav_search"
            href={
              activeProjectId
                ? `/dashboard/search?projectId=${activeProjectId}`
                : "/dashboard/search"
            }
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith("/dashboard/search")
                ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Search className="w-4 h-4 text-indigo-400" />
            Log Search
          </Link>

          <Link
            id="nav_traces"
            href={
              activeProjectId
                ? `/dashboard/traces?projectId=${activeProjectId}`
                : "/dashboard/traces"
            }
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith("/dashboard/traces")
                ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Network className="w-4 h-4 text-indigo-400" />
            APM Traces
          </Link>

          <Link
            id="nav_playground"
            href={
              activeProjectId
                ? `/dashboard/playground?projectId=${activeProjectId}`
                : "/dashboard/playground"
            }
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith("/dashboard/playground")
                ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Terminal className="w-4 h-4 text-indigo-400" />
            Playground
          </Link>

          {!isSelfHost && (
            <Link
              id="nav_billing"
              href={
                activeProjectId
                  ? `/dashboard/billing?projectId=${activeProjectId}`
                  : "/dashboard/billing"
              }
              onClick={handleLinkClick}
              className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith("/dashboard/billing")
                  ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
              }`}
            >
              <CreditCard className="w-4 h-4 text-indigo-400" />
              Billing
            </Link>
          )}

          <Link
            id="nav_settings"
            href={
              activeProjectId
                ? `/dashboard/settings?projectId=${activeProjectId}`
                : "/dashboard/settings"
            }
            onClick={handleLinkClick}
            className={`flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
              pathname.startsWith("/dashboard/settings")
                ? "bg-indigo-600/15 border border-indigo-500/30 text-white font-semibold"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Settings className="w-4 h-4 text-indigo-400" />
            Settings
          </Link>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed select-none">
            <AlertOctagon className="w-4 h-4 text-slate-700" />
            Incidents
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed select-none">
            <Search className="w-4 h-4 text-slate-700" />
            Log Search
          </div>
          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed select-none">
            <Terminal className="w-4 h-4 text-slate-700" />
            Playground
          </div>
          {!isSelfHost && (
            <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed select-none">
              <CreditCard className="w-4 h-4 text-slate-700" />
              Billing
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-slate-600 cursor-not-allowed select-none">
            <Settings className="w-4 h-4 text-slate-700" />
            Settings
          </div>
        </>
      )}
    </nav>
  );
}
