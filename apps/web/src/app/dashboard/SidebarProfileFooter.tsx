import Image from "next/image";
import { LogOut } from "lucide-react";

interface SidebarProfileFooterProps {
  user: {
    username: string;
    avatarUrl: string;
    email: string;
  };
}

export default function SidebarProfileFooter({
  user,
}: SidebarProfileFooterProps) {
  return (
    <div className="p-4 border-t border-slate-900 bg-slate-950/50">
      <div className="flex items-center gap-3 mb-4">
        {user.avatarUrl ? (
          <Image
            src={user.avatarUrl}
            alt={user.username}
            width={36}
            height={36}
            className="w-9 h-9 rounded-full border border-slate-800"
            unoptimized
          />
        ) : (
          <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
            {user.username.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-200 truncate">
            {user.username}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {user.email || "No public email"}
          </p>
        </div>
      </div>

      <form action="/api/auth/logout" method="POST" className="w-full">
        <button
          id="logout_btn"
          type="submit"
          className="w-full flex items-center gap-2 justify-center text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-900 border border-slate-900 hover:border-slate-800 h-9 rounded-lg transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          Sign Out
        </button>
      </form>

      <div className="mt-4 text-center border-t border-slate-900/40 pt-3">
        <p className="text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
          Self-Hosted Edition
        </p>
        <a
          href="https://github.com/Vaibhav-Singh2/ObservabilityOS"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-indigo-400/70 hover:text-indigo-400 transition-colors inline-flex items-center gap-0.5 mt-0.5"
        >
          Documentation & Support
        </a>
      </div>
    </div>
  );
}
