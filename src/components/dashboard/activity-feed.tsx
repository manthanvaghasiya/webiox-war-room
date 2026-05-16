"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";

import { createClient } from "@/lib/supabase/client";
import { AGENTS, type AgentLog, type AgentName, type LogLevel } from "@/types/database";

const AGENT_BY_ID: Record<AgentName, (typeof AGENTS)[number]> =
  Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<
    AgentName,
    (typeof AGENTS)[number]
  >;

const LEVEL_TONE: Record<LogLevel, string> = {
  info: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-secondary)]",
  success: "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  warning: "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  error: "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
};

const MAX_ROWS = 30;

export function ActivityFeed({
  userId,
  initialLogs,
}: {
  userId: string;
  initialLogs: AgentLog[];
}) {
  const [logs, setLogs] = useState<AgentLog[]>(initialLogs);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("agent_logs_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "agent_logs",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as AgentLog;
          setLogs((prev) => [row, ...prev].slice(0, MAX_ROWS));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  if (logs.length === 0) {
    return (
      <div className="panel flex h-32 flex-col items-center justify-center text-center">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
          Awaiting first agent activity…
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
            <th className="px-4 py-3 font-normal">Time</th>
            <th className="px-4 py-3 font-normal">Agent</th>
            <th className="px-4 py-3 font-normal">Action</th>
            <th className="px-4 py-3 font-normal">Message</th>
            <th className="px-4 py-3 font-normal">Level</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {logs.map((log) => {
              const agent = AGENT_BY_ID[log.agent];
              return (
                <motion.tr
                  key={log.id}
                  layout
                  initial={{ opacity: 0, y: -8, backgroundColor: "rgba(0,255,136,0.10)" }}
                  animate={{ opacity: 1, y: 0, backgroundColor: "rgba(0,0,0,0)" }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                  className="border-b border-[color:var(--color-border-base)]/60 last:border-0"
                >
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-text-secondary)]">
                    {formatDistanceToNow(new Date(log.created_at), {
                      addSuffix: true,
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2 text-xs text-[color:var(--color-text-primary)]">
                      <span
                        aria-hidden
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: agent?.color ?? "currentColor",
                          boxShadow: `0 0 6px ${agent?.color ?? "currentColor"}`,
                        }}
                      />
                      <span aria-hidden>{agent?.emoji}</span>
                      {agent?.label ?? log.agent}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-text-secondary)]">
                    {log.action}
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
                    {log.message ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                        LEVEL_TONE[log.level]
                      }
                    >
                      {log.level}
                    </span>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
