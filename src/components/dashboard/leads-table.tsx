"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ArrowUpRight, Check, Copy, ExternalLink, Info } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { AgentActionInline } from "@/components/dashboard/agent-action-buttons";
import {
  LeadCallDrawer,
  type DrawerLead,
} from "@/components/dashboard/lead-call-drawer";
import {
  ScoreBadge,
  SegmentBadge,
  SolutionBadge,
  TierBadge,
} from "@/components/dashboard/lead-badges";
import {
  CALL_OUTCOME_OPTIONS,
  type CallOutcome,
  type Lead,
  type LeadStatus,
  type SolutionType,
} from "@/types/database";

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
  | "call_outcome"
  | "call_notes"
  | "follow_up_draft"
  | "google_rating"
  | "review_count"
>;

type DecidableOutcome = Exclude<CallOutcome, "pending_call">;

const OUTCOME_BY_VALUE = Object.fromEntries(
  CALL_OUTCOME_OPTIONS.map((o) => [o.value, o]),
) as Record<CallOutcome, (typeof CALL_OUTCOME_OPTIONS)[number]>;

// The three quick-action buttons shown in the OUTCOME column.
const OUTCOME_BUTTONS: ReadonlyArray<{
  value: DecidableOutcome;
  emoji: string;
  color: string;
  title: string;
}> = [
  { value: "confirmed", emoji: "✅", color: "#00ff88", title: "Confirmed" },
  { value: "rejected", emoji: "❌", color: "#ef4444", title: "Rejected" },
  { value: "follow_up", emoji: "⏳", color: "#fbbf24", title: "Pending" },
];

function OutcomeCell({
  lead,
  onPick,
}: {
  lead: LeadRow;
  onPick: (lead: LeadRow, outcome: DecidableOutcome) => void;
}) {
  const current = lead.call_outcome ?? "pending_call";
  const meta = OUTCOME_BY_VALUE[current];
  const decided = current !== "pending_call";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1">
        {OUTCOME_BUTTONS.map((b) => {
          const active = current === b.value;
          return (
            <button
              key={b.value}
              type="button"
              title={b.title}
              onClick={() => onPick(lead, b.value)}
              className="rounded border px-1.5 py-1 text-xs leading-none transition hover:brightness-125"
              style={{
                borderColor: active ? b.color : "var(--color-border-base)",
                backgroundColor: active
                  ? `color-mix(in srgb, ${b.color} 18%, transparent)`
                  : "transparent",
                opacity: active ? 1 : 0.75,
              }}
            >
              <span aria-hidden>{b.emoji}</span>
            </button>
          );
        })}
      </div>
      {decided ? (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
          style={{
            color: meta.color,
            backgroundColor: `color-mix(in srgb, ${meta.color} 16%, transparent)`,
          }}
        >
          {meta.label}
        </span>
      ) : null}
    </div>
  );
}

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

// Step 14 — pulls the "SIGNALS: ... • ... • ..." line out of the
// research_note so we can render it as a 2-line muted strip directly under
// the Solution badge. Older notes that use the "SIGNALS:\n✓ rating ✓..."
// multi-line format simply yield null and the strip is omitted.
function extractSignalsLine(note: string | null): string | null {
  if (!note) return null;
  const idx = note.indexOf("SIGNALS:");
  if (idx === -1) return null;
  const after = note.slice(idx + "SIGNALS:".length);
  // Take everything up to the next blank line; trim whitespace.
  const stop = after.indexOf("\n\n");
  const line = (stop === -1 ? after : after.slice(0, stop)).trim();
  // Only render the inline format — multi-line checklists have ticks on
  // their own line, which we deliberately skip.
  if (!line || line.includes("\n")) return null;
  return line;
}

function SolutionCell({
  solution,
  researchNote,
}: {
  solution: SolutionType | null;
  researchNote: string | null;
}) {
  const signals = extractSignalsLine(researchNote);
  return (
    <div className="max-w-[280px] space-y-1">
      <SolutionBadge solution={solution} />
      {signals ? (
        <p
          className="line-clamp-2 font-mono text-[11px] leading-snug text-[color:var(--color-text-secondary)]"
          title={signals}
        >
          {signals}
        </p>
      ) : null}
    </div>
  );
}

// Why cell — solution_reason is primary; if research_note contains call scripts
// (delimited by ---CALL SCRIPT markers), parse them into tabbed view.
// The table column shows only the summary (text before the first marker).

type ParsedCallScript = {
  label: string;
  body: string;
};

function parseCallScripts(note: string): {
  summary: string;
  scripts: ParsedCallScript[];
} {
  const marker = "---CALL SCRIPT";
  const idx = note.indexOf(marker);
  if (idx === -1) return { summary: note, scripts: [] };

  const summary = note.slice(0, idx).trim();
  const rest = note.slice(idx);

  // Split on each ---CALL SCRIPT ... --- line
  const parts = rest.split(/---CALL SCRIPT\s*/).filter(Boolean);
  const scripts: ParsedCallScript[] = [];

  for (const part of parts) {
    // Each part looks like: "(Hinglish)---\n...body..."
    const headerEnd = part.indexOf("---");
    if (headerEnd === -1) continue;
    const label = part.slice(0, headerEnd).replace(/[()]/g, "").trim();
    const body = part.slice(headerEnd + 3).trim();
    if (label && body) {
      scripts.push({ label, body });
    }
  }

  return { summary, scripts };
}

function WhyCell({
  reason,
  researchNote,
}: {
  reason: string | null;
  researchNote: string | null;
}) {
  const [showNote, setShowNote] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const parsed = useMemo(
    () => (researchNote ? parseCallScripts(researchNote) : null),
    [researchNote],
  );
  const hasScripts = !!parsed && parsed.scripts.length > 0;

  const copyScript = async (idx: number) => {
    if (!parsed?.scripts[idx]) return;
    try {
      await navigator.clipboard.writeText(parsed.scripts[idx].body);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // clipboard blocked
    }
  };

  const copyAll = async () => {
    if (!researchNote) return;
    try {
      await navigator.clipboard.writeText(researchNote);
      setCopiedIdx(-1);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // clipboard blocked
    }
  };

  if (!reason && !researchNote) {
    return (
      <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
        —
      </span>
    );
  }

  // Use summary from parsed scripts if available, otherwise fall back to reason
  const primary = reason ?? parsed?.summary ?? researchNote ?? "";
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
            aria-label="Show call script"
            title={hasScripts ? "Show call scripts" : "Show enrichment note"}
            className="mt-0.5 shrink-0 text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-neon-green)]"
          >
            <Info className="size-3" />
          </button>
        ) : null}
      </div>
      {showNote && hasExtraNote ? (
        <div className="space-y-1.5 rounded border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/70 px-2 py-1.5">
          {hasScripts ? (
            <>
              {/* Summary line */}
              {parsed!.summary && (
                <div className="font-mono text-[9px] leading-snug text-[color:var(--color-text-muted)]">
                  {parsed!.summary}
                </div>
              )}
              {/* Language tabs */}
              <div className="flex gap-1">
                {parsed!.scripts.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setActiveTab(i)}
                    className={
                      "rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition " +
                      (activeTab === i
                        ? "bg-[color:var(--color-neon-green)]/20 text-[color:var(--color-neon-green)]"
                        : "text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-secondary)]")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Active script body */}
              {parsed!.scripts[activeTab] && (
                <div className="font-mono text-[9px] leading-snug whitespace-pre-wrap text-[color:var(--color-text-secondary)] max-h-[200px] overflow-y-auto rounded bg-[color:var(--color-bg-elevated)]/50 p-2">
                  {parsed!.scripts[activeTab].body}
                </div>
              )}
              {/* Copy buttons */}
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => copyScript(activeTab)}
                  className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-green)] hover:text-[color:var(--color-neon-green)]"
                >
                  {copiedIdx === activeTab ? (
                    <Check className="size-2.5" />
                  ) : (
                    <Copy className="size-2.5" />
                  )}
                  {copiedIdx === activeTab ? "Copied" : `Copy ${parsed!.scripts[activeTab]?.label ?? "Script"}`}
                </button>
                <button
                  type="button"
                  onClick={copyAll}
                  className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-purple)] hover:text-[color:var(--color-neon-purple)]"
                >
                  {copiedIdx === -1 ? (
                    <Check className="size-2.5" />
                  ) : (
                    <Copy className="size-2.5" />
                  )}
                  {copiedIdx === -1 ? "Copied" : "Copy All"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="font-mono text-[9px] leading-snug whitespace-pre-wrap text-[color:var(--color-text-muted)]">
                {researchNote}
              </div>
              <button
                type="button"
                onClick={copyAll}
                className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-green)] hover:text-[color:var(--color-neon-green)]"
              >
                {copiedIdx === -1 ? (
                  <Check className="size-2.5" />
                ) : (
                  <Copy className="size-2.5" />
                )}
                {copiedIdx === -1 ? "Copied" : "Copy Note"}
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export type TierFilter = "all" | "confirmed" | "probable";

export function LeadsTable({
  userId,
  initialLeads,
  activeSolution = null,
  pipelineReady = false,
  tierFilter = "all",
}: {
  userId: string;
  initialLeads: LeadRow[];
  activeSolution?: SolutionType | null;
  pipelineReady?: boolean;
  tierFilter?: TierFilter;
}) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);

  // Call-outcome drawer state — which lead is open and which button was clicked.
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [drawerOutcome, setDrawerOutcome] =
    useState<DecidableOutcome>("confirmed");
  const openDrawer = (lead: LeadRow, outcome: DecidableOutcome) => {
    setDrawerLead(lead);
    setDrawerOutcome(outcome);
  };
  const drawerLeadSummary: DrawerLead | null = drawerLead
    ? {
        id: drawerLead.id,
        company: drawerLead.company,
        phone: drawerLead.phone,
        google_rating: drawerLead.google_rating,
        review_count: drawerLead.review_count,
        recommended_solution: drawerLead.recommended_solution,
        call_outcome: drawerLead.call_outcome,
        call_notes: drawerLead.call_notes,
        follow_up_draft: drawerLead.follow_up_draft,
      }
    : null;

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

  // Filter (pipeline-ready takes precedence over solution, then tier-only
  // filter applies on top), then sort by tier (confirmed > probable > other),
  // confidence breaks the tie — so the strongest tier sits on top regardless
  // of what the qualifier later writes back into lead_score.
  const visible = useMemo(() => {
    let rows = leads;
    if (pipelineReady) {
      rows = rows.filter((l) => l.lead_score >= 70);
    } else if (activeSolution) {
      rows = rows.filter((l) => l.recommended_solution === activeSolution);
    }
    if (tierFilter === "confirmed") {
      rows = rows.filter((l) => l.lead_score >= 75);
    } else if (tierFilter === "probable") {
      rows = rows.filter((l) => l.lead_score >= 50 && l.lead_score < 75);
    }
    return [...rows].sort((a, b) => {
      const tierRank = (s: number) => (s >= 75 ? 2 : s >= 50 ? 1 : 0);
      const rb = tierRank(b.lead_score);
      const ra = tierRank(a.lead_score);
      if (rb !== ra) return rb - ra;
      return b.lead_score - a.lead_score;
    });
  }, [leads, activeSolution, pipelineReady, tierFilter]);

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
    <>
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[1400px] text-sm">
        <thead>
          <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
            <th className="px-4 py-3 font-normal">Segment</th>
            <th className="px-4 py-3 font-normal">Name</th>
            <th className="px-4 py-3 font-normal">Company</th>
            <th className="px-4 py-3 font-normal">Title</th>
            <th className="px-4 py-3 font-normal">Contact</th>
            <th className="px-4 py-3 font-normal">Address</th>
            <th className="px-4 py-3 font-normal">Solution</th>
            <th className="px-4 py-3 font-normal">Outcome</th>
            <th className="px-4 py-3 font-normal">Why</th>
            <th className="px-4 py-3 font-normal">Status</th>
            <th className="px-4 py-3 font-normal text-center">Verified</th>
            <th className="px-4 py-3 font-normal">Tier</th>
            <th className="px-4 py-3 font-normal text-right">Score</th>
            <th className="px-4 py-3 font-normal text-right">Created</th>
            <th className="px-4 py-3 font-normal text-right">Detail</th>
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
                    <SolutionCell
                      solution={l.recommended_solution}
                      researchNote={l.research_note}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <OutcomeCell lead={l} onPick={openDrawer} />
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
                  <td className="px-4 py-3">
                    <TierBadge score={l.lead_score} />
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
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/leads/${l.id}`}
                      title="Open detail"
                      className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-neon-green)]"
                    >
                      Open
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
    <LeadCallDrawer
      lead={drawerLeadSummary}
      open={drawerLead !== null}
      initialOutcome={drawerOutcome}
      onClose={() => setDrawerLead(null)}
    />
    </>
  );
}
