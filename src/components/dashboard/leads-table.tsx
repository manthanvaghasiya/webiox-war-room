"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Check, ExternalLink, Info } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AgentActionInline } from "@/components/dashboard/agent-action-buttons";
import {
  ScoreBadge,
  SegmentBadge,
  SolutionBadge,
} from "@/components/dashboard/lead-badges";
import { type Lead, type LeadStatus, type SolutionType } from "@/types/database";

export type LeadRow = Pick<
  Lead,
  | "id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "company"
  | "job_title"
  | "email"
  | "email_verified"
  | "phone"
  | "address"
  | "website"
  | "research_note"
  | "recommended_solution"
  | "solution_reason"
  | "status"
  | "lead_score"
  | "lead_score_reason"
  | "segment"
  | "created_at"
>;

const STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-secondary)]",
  enriching:
    "bg-[color:var(--color-neon-purple-dim)] text-[color:var(--color-neon-purple)]",
  contacted:
    "bg-[color:var(--color-neon-purple-dim)] text-[color:var(--color-neon-purple)]",
  replied:
    "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  qualified:
    "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  not_interested:
    "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
  invalid:
    "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
  cold: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-muted)]",
};

// Address cell — line 1 is the address; line 2 surfaces website visibility so
// nothing from the Step 6 layout is lost despite there being no Website column.
function AddressCell({
  segment,
  address,
  website,
}: {
  segment: LeadRow["segment"];
  address: string | null;
  website: string | null;
}) {
  const host = (() => {
    if (!website) return null;
    try {
      return new URL(website).hostname.replace(/^www\./, "");
    } catch {
      return website;
    }
  })();

  return (
    <div className="max-w-[220px] space-y-1">
      <span
        className="line-clamp-2 font-mono text-[10px] leading-snug text-[color:var(--color-text-secondary)]"
        title={address ?? undefined}
      >
        {address ?? "—"}
      </span>
      {host ? (
        <a
          href={website ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs text-[color:var(--color-neon-green)] hover:underline"
          title={website ?? undefined}
        >
          <span aria-hidden>🌐</span>
          {host}
          <ExternalLink className="size-3" />
        </a>
      ) : segment === "local_india" ? (
        <span
          className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-xs uppercase tracking-wider"
          style={{
            color: "var(--color-neon-red)",
            backgroundColor:
              "color-mix(in srgb, var(--color-neon-red) 18%, transparent)",
          }}
        >
          <span aria-hidden>🔴</span>No website
        </span>
      ) : null}
    </div>
  );
}

// Why cell — solution_reason is primary; if research_note exists and differs,
// an ⓘ toggle reveals the raw enrichment note.
function WhyCell({
  reason,
  researchNote,
}: {
  reason: string | null;
  researchNote: string | null;
}) {
  const [showNote, setShowNote] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!reason && !researchNote) {
    return (
      <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
        —
      </span>
    );
  }

  const primary = reason ?? researchNote ?? "";
  const hasExtraNote =
    !!researchNote && researchNote.trim() !== (reason ?? "").trim();
  const needsTrim = primary.length > 90;
  const shown =
    expanded || !needsTrim ? primary : primary.slice(0, 89) + "…";

  return (
    <div className="max-w-[260px] space-y-1">
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={() => needsTrim && setExpanded((v) => !v)}
          title={expanded ? "Click to collapse" : primary}
          className={
            "block flex-1 text-left font-mono text-[10px] leading-snug text-[color:var(--color-text-secondary)] transition hover:text-[color:var(--color-text-primary)] " +
            (needsTrim ? "cursor-pointer " : "cursor-default ") +
            (expanded ? "whitespace-pre-wrap" : "")
          }
        >
          {shown}
        </button>
        {hasExtraNote ? (
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            aria-label="Show enrichment note"
            title="Show enrichment note"
            className="mt-0.5 shrink-0 text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-neon-green)]"
          >
            <Info className="size-3" />
          </button>
        ) : null}
      </div>
      {showNote && hasExtraNote ? (
        <div className="rounded border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/70 px-2 py-1 font-mono text-[9px] leading-snug whitespace-pre-wrap text-[color:var(--color-text-muted)]">
          {researchNote}
        </div>
      ) : null}
    </div>
  );
}

export function LeadsTable({
  userId,
  initialLeads,
  activeSolution = null,
  pipelineReady = false,
}: {
  userId: string;
  initialLeads: LeadRow[];
  activeSolution?: SolutionType | null;
  pipelineReady?: boolean;
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("leads_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "leads",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as LeadRow;
          setLeads((prev) =>
            prev.some((l) => l.id === row.id) ? prev : [row, ...prev],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "leads",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as LeadRow;
          setLeads((prev) =>
            prev.map((l) => (l.id === row.id ? { ...l, ...row } : l)),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Filter (pipeline-ready takes precedence over solution), then sort by
  // score DESC so the highest-value leads sit on top — re-sorts live as the
  // qualifier writes new scores.
  const visible = useMemo(() => {
    let rows = leads;
    if (pipelineReady) {
      rows = rows.filter((l) => l.lead_score >= 70);
    } else if (activeSolution) {
      rows = rows.filter((l) => l.recommended_solution === activeSolution);
    }
    return [...rows].sort((a, b) => b.lead_score - a.lead_score);
  }, [leads, activeSolution, pipelineReady]);

  if (leads.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-4 p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
          No leads yet.
        </p>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          Run the Lead Scout to find some.
        </p>
        <AgentActionInline agentId="lead_scout" />
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="panel flex flex-col items-center justify-center gap-2 p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
          No leads for this solution
        </p>
        <p className="text-sm text-[color:var(--color-text-secondary)]">
          Try a different filter.
        </p>
      </div>
    );
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[1180px] text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
            <th className="px-4 py-3 font-normal">Segment</th>
            <th className="px-4 py-3 font-normal">Name</th>
            <th className="px-4 py-3 font-normal">Company</th>
            <th className="px-4 py-3 font-normal">Title</th>
            <th className="px-4 py-3 font-normal">Contact</th>
            <th className="px-4 py-3 font-normal">Address</th>
            <th className="px-4 py-3 font-normal">Solution</th>
            <th className="px-4 py-3 font-normal">Why</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal text-center">Verified</th>
            <th className="px-4 py-3 font-normal text-right">Score</th>
            <th className="px-4 py-3 font-normal text-right">Created</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {visible.map((l) => {
              const fullName =
                l.full_name ||
                [l.first_name, l.last_name].filter(Boolean).join(" ") ||
                "—";
              return (
                <motion.tr
                  key={l.id}
                  layout
                  initial={{
                    opacity: 0,
                    y: -8,
                    backgroundColor: "rgba(0,255,136,0.10)",
                  }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    backgroundColor: "rgba(0,0,0,0)",
                  }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="border-b border-[color:var(--color-border-base)]/60 align-top last:border-0 hover:bg-[color:var(--color-bg-elevated)]/40"
                >
                  <td className="px-4 py-3">
                    <SegmentBadge segment={l.segment} />
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-text-primary)]">
                    {fullName}
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
                    {l.company ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
                    {l.job_title ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {l.phone ? (
                      <span className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                        {l.phone}
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <AddressCell
                      segment={l.segment}
                      address={l.address}
                      website={l.website}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <SolutionBadge solution={l.recommended_solution} />
                  </td>
                  <td className="px-4 py-3">
                    <WhyCell
                      reason={l.solution_reason}
                      researchNote={l.research_note}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                        STATUS_TONE[l.status]
                      }
                    >
                      {l.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {l.email_verified ? (
                      <Check
                        className="inline size-3.5"
                        style={{ color: "var(--color-neon-green)" }}
                        aria-label="email verified"
                      />
                    ) : (
                      <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
                        —
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ScoreBadge
                      score={l.lead_score}
                      reason={l.lead_score_reason}
                    />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-[color:var(--color-text-muted)]">
                    {formatDistanceToNow(new Date(l.created_at), {
                      addSuffix: true,
                    })}
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
