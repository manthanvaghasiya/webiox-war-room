"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  Target,
  TrendingUp,
  Phone,
  Briefcase,
  MessageSquare,
  FileText,
  Settings,
  LogOut,
  Bot,
  type LucideIcon,
} from "lucide-react";

import { AGENTS, type AgentName, type AgentState } from "@/types/database";
import { signOut } from "@/app/login/actions";
import { createClient } from "@/lib/supabase/client";

type NavLink = { href: string; label: string; icon: LucideIcon };

const NAV: NavLink[] = [
  { href: "/", label: "Command Center", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/qualified", label: "Qualified", icon: Target },
  { href: "/deals", label: "Pipeline", icon: TrendingUp },
  { href: "/calls", label: "Calls", icon: Phone },
  { href: "/clients", label: "Clients", icon: Briefcase },
  { href: "/comms", label: "Comms", icon: MessageSquare },
  { href: "/proposals", label: "Proposals", icon: FileText },
  { href: "/agents", label: "Agent Squad", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
];

const STATE_LABEL: Record<AgentState, string> = {
  idle: "IDLE",
  running: "RUN",
  error: "ERR",
  paused: "PAUSE",
};

const STATE_TONE: Record<AgentState, string> = {
  idle: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-muted)]",
  running: "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  error: "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
  paused: "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
};

const DOT_TONE: Record<AgentState, string> = {
  idle: "",
  running: "pulse-glow",
  error: "pulse-glow",
  paused: "",
};

export function Sidebar({
  userId,
  userEmail,
  initialStates,
}: {
  userId: string;
  userEmail: string | null;
  initialStates: Record<AgentName, AgentState>;
}) {
  const pathname = usePathname();
  const [states, setStates] =
    useState<Record<AgentName, AgentState>>(initialStates);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agent_status_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "agent_status",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            agent?: AgentName;
            state?: AgentState;
          } | null;
          if (!row?.agent || !row.state) return;
          setStates((prev) => ({ ...prev, [row.agent!]: row.state! }));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <motion.aside
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex h-screen w-[280px] shrink-0 flex-col border-r border-[color:var(--color-neon-green-dim)] bg-[color:var(--color-bg-panel)]"
    >
      {/* Logo block */}
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border-base)] px-5 py-5">
        <motion.span
          aria-hidden
          className="h-2 w-2 rounded-full bg-[color:var(--color-neon-green)] text-[color:var(--color-neon-green)] shadow-[0_0_8px_var(--color-neon-green)]"
          animate={{ opacity: [1, 0.4, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="leading-tight">
          <div className="font-mono text-base font-semibold tracking-[0.25em] text-[color:var(--color-neon-green)]">
            WEBIOX
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            War Room v0.1
          </div>
        </div>
      </div>

      {/* Primary nav */}
      <nav className="flex flex-col gap-0.5 px-3 py-4">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={
                "group relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition " +
                (active
                  ? "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)] before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[2px] before:-translate-y-1/2 before:bg-[color:var(--color-neon-green)] before:shadow-[0_0_6px_var(--color-neon-green)]"
                  : "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-elevated)] hover:text-[color:var(--color-text-primary)]")
              }
            >
              <Icon className="size-4 shrink-0" />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Agent squad */}
      <div className="mt-2 border-t border-[color:var(--color-border-base)] px-3 pt-4 pb-2">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[color:var(--color-text-muted)]">
          Agent Squad · {AGENTS.length}
        </div>

        <ul className="flex flex-col gap-0.5 overflow-y-auto pr-1">
          {AGENTS.map((agent, i) => {
            const state = states[agent.id] ?? "idle";
            const dotColor =
              state === "error"
                ? "#ff3366"
                : state === "paused"
                  ? "#fbbf24"
                  : state === "running"
                    ? "#00ff88"
                    : agent.color;
            return (
              <motion.li
                key={agent.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-bg-elevated)]"
              >
                <span
                  aria-hidden
                  className={
                    "h-1.5 w-1.5 shrink-0 rounded-full " + DOT_TONE[state]
                  }
                  style={{
                    backgroundColor: dotColor,
                    boxShadow: `0 0 6px ${dotColor}`,
                    color: dotColor,
                  }}
                />
                <span aria-hidden className="text-sm leading-none">
                  {agent.emoji}
                </span>
                <span className="flex-1 truncate">{agent.label}</span>
                <span
                  className={
                    "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                    STATE_TONE[state]
                  }
                >
                  {STATE_LABEL[state]}
                </span>
              </motion.li>
            );
          })}
        </ul>
      </div>

      {/* User footer */}
      <div className="mt-auto flex items-center gap-2 border-t border-[color:var(--color-border-base)] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--color-border-bright)] bg-[color:var(--color-bg-elevated)] text-[10px] font-semibold uppercase text-[color:var(--color-text-secondary)]">
          {(userEmail ?? "?").slice(0, 1)}
        </div>
        <div className="flex-1 truncate text-xs text-[color:var(--color-text-secondary)]">
          {userEmail ?? "unknown"}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            title="Sign out"
            className="rounded p-1.5 text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-elevated)] hover:text-[color:var(--color-neon-red)]"
          >
            <LogOut className="size-4" />
          </button>
        </form>
      </div>
    </motion.aside>
  );
}
