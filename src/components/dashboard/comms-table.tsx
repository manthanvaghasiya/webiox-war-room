"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, Info, X } from "lucide-react";
import { toast } from "sonner";

import { simulateInboundReply } from "@/app/(dashboard)/actions";
import {
  AGENTS,
  type AgentName,
  type CommChannel,
  type CommDirection,
  type CommStatus,
  type LeadLanguage,
  type LeadSegment,
  type SolutionType,
} from "@/types/database";

type ReplyIntent = "interested" | "not_interested" | "objection" | "question";

export type CommRow = {
  id: string;
  lead_id: string;
  channel: CommChannel;
  direction: CommDirection;
  status: CommStatus;
  subject: string | null;
  content: string | null;
  language: LeadLanguage;
  external_id: string | null;
  generated_by_agent: AgentName | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  created_at: string;
  leads: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    segment: LeadSegment;
    recommended_solution: SolutionType | null;
  } | null;
};

export type CommsFilter =
  | "all"
  | "outbound"
  | "inbound"
  | "email"
  | "whatsapp"
  | "queued"
  | "sent"
  | "replied"
  | "failed";

const AGENT_BY_ID = Object.fromEntries(
  AGENTS.map((a) => [a.id, a]),
) as Record<AgentName, (typeof AGENTS)[number]>;

const STATUS_TONE: Record<CommStatus, string> = {
  queued:
    "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-secondary)]",
  sending:
    "bg-[color:var(--color-neon-purple-dim)] text-[color:var(--color-neon-purple)]",
  sent: "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  delivered:
    "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  read: "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  replied:
    "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  failed: "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
};

const LANGUAGE_META: Record<LeadLanguage, { flag: string; label: string }> = {
  english: { flag: "🇬🇧", label: "EN" },
  hinglish: { flag: "🇮🇳", label: "HI" },
  gujarati: { flag: "🇮🇳", label: "GU" },
  hindi: { flag: "🇮🇳", label: "HI" },
};

const FILTER_PILLS: { id: CommsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "outbound", label: "Outbound" },
  { id: "inbound", label: "Inbound" },
  { id: "email", label: "📧 Email" },
  { id: "whatsapp", label: "💬 WhatsApp" },
  { id: "queued", label: "Queued" },
  { id: "sent", label: "Sent" },
  { id: "replied", label: "Replied" },
];

function matchesFilter(row: CommRow, filter: CommsFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "outbound":
    case "inbound":
      return row.direction === filter;
    case "email":
      return row.channel === "email";
    case "whatsapp":
      return row.channel === "whatsapp";
    case "queued":
    case "sent":
    case "replied":
    case "failed":
      return row.status === filter;
  }
}

function ChannelBadge({ channel }: { channel: CommChannel }) {
  const isEmail = channel === "email";
  return (
    <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-secondary)]">
      <span aria-hidden>{isEmail ? "📧" : "💬"}</span>
      {isEmail ? "Email" : "WhatsApp"}
    </span>
  );
}

function leadName(row: CommRow): string {
  const l = row.leads;
  return (
    [l?.first_name, l?.last_name].filter(Boolean).join(" ") ||
    l?.company ||
    "Unknown"
  );
}

export function CommsTable({
  initialComms,
  initialFilter = "all",
}: {
  initialComms: CommRow[];
  initialFilter?: CommsFilter;
}) {
  const [filter, setFilter] = useState<CommsFilter>(initialFilter);
  const [selected, setSelected] = useState<CommRow | null>(null);

  const visible = useMemo(
    () => initialComms.filter((c) => matchesFilter(c, filter)),
    [initialComms, filter],
  );

  const countFor = (f: CommsFilter) =>
    f === "all"
      ? initialComms.length
      : initialComms.filter((c) => matchesFilter(c, f)).length;

  return (
    <>
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTER_PILLS.map((p) => {
          const active = filter === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setFilter(p.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition " +
                (active
                  ? "border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green-dim)]/40 text-[color:var(--color-neon-green)]"
                  : "border-[color:var(--color-border-base)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-border-bright)] hover:text-[color:var(--color-text-primary)]")
              }
            >
              {p.label}
              <span
                className="rounded-sm bg-[color:var(--color-bg-base)]/70 px-1 font-mono-num text-[10px]"
                style={{
                  color: active
                    ? "var(--color-neon-green)"
                    : "var(--color-text-muted)",
                }}
              >
                {countFor(p.id)}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center gap-2 p-12 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
            No communications for this filter
          </p>
          <p className="text-sm text-[color:var(--color-text-secondary)]">
            Try a different pill.
          </p>
        </div>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[1040px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                <th className="px-4 py-3 font-normal">Time</th>
                <th className="px-4 py-3 font-normal">Lead</th>
                <th className="px-4 py-3 font-normal">Channel</th>
                <th className="px-4 py-3 font-normal">Direction</th>
                <th className="px-4 py-3 font-normal">Language</th>
                <th className="px-4 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal">Preview</th>
                <th className="px-4 py-3 font-normal text-center">By</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const agent = c.generated_by_agent
                  ? AGENT_BY_ID[c.generated_by_agent]
                  : undefined;
                const lang = LANGUAGE_META[c.language];
                const preview = (c.content ?? "").replace(/\s+/g, " ").trim();
                return (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="cursor-pointer border-b border-[color:var(--color-border-base)]/60 last:border-0 hover:bg-[color:var(--color-bg-elevated)]/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-text-muted)]">
                      {formatDistanceToNow(new Date(c.created_at), {
                        addSuffix: true,
                      })}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="text-[color:var(--color-text-primary)]">
                        {leadName(c)}
                      </div>
                      <div className="text-[10px] text-[color:var(--color-text-muted)]">
                        {c.leads?.company ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <ChannelBadge channel={c.channel} />
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-text-secondary)]">
                        {c.direction === "outbound" ? (
                          <ArrowUpRight
                            className="size-3.5"
                            style={{ color: "var(--color-neon-green)" }}
                          />
                        ) : (
                          <ArrowDownLeft
                            className="size-3.5"
                            style={{ color: "var(--color-neon-amber)" }}
                          />
                        )}
                        {c.direction}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded bg-[color:var(--color-bg-elevated)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)]">
                        <span aria-hidden>{lang.flag}</span>
                        {lang.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                          STATUS_TONE[c.status]
                        }
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="max-w-[320px] px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[10px] text-[color:var(--color-text-secondary)]">
                        <span className="line-clamp-1 font-mono">
                          {preview.slice(0, 80) || "—"}
                          {preview.length > 80 ? "…" : ""}
                        </span>
                        <Info className="size-3 shrink-0 text-[color:var(--color-text-muted)]" />
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-base">
                      <span title={agent?.label ?? c.generated_by_agent ?? ""}>
                        {agent?.emoji ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <PreviewDrawer comm={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function PreviewDrawer({
  comm,
  onClose,
}: {
  comm: CommRow | null;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {comm ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col overflow-y-auto border-l border-[color:var(--color-neon-green-dim)] bg-[color:var(--color-bg-panel)] p-6"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
                  // message preview
                </div>
                <div className="mt-1 font-mono text-sm uppercase tracking-[0.18em] text-[color:var(--color-text-primary)]">
                  {comm.channel === "email" ? "📧 Email" : "💬 WhatsApp"} ·{" "}
                  {comm.language}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-[color:var(--color-text-muted)] transition hover:bg-[color:var(--color-bg-elevated)] hover:text-[color:var(--color-text-primary)]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>

            {comm.subject ? (
              <div className="mb-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  Subject
                </div>
                <div className="mt-1 text-sm text-[color:var(--color-text-primary)]">
                  {comm.subject}
                </div>
              </div>
            ) : null}

            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                Message
              </div>
              <pre className="mt-1 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/70 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--color-text-secondary)]">
                {comm.content ?? "—"}
              </pre>
            </div>

            <div className="mb-4 rounded-md border border-[color:var(--color-border-base)] p-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                Lead
              </div>
              <div className="mt-1 text-sm text-[color:var(--color-text-primary)]">
                {comm.leads
                  ? [comm.leads.first_name, comm.leads.last_name]
                      .filter(Boolean)
                      .join(" ") || comm.leads.company
                  : "—"}
              </div>
              <div className="text-xs text-[color:var(--color-text-secondary)]">
                {comm.leads?.company ?? "—"}
                {comm.leads?.recommended_solution
                  ? ` · ${comm.leads.recommended_solution}`
                  : ""}
              </div>
            </div>

            <div className="mb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                Status timeline
              </div>
              <ul className="mt-1 space-y-1">
                <TimelineRow label="Queued" iso={comm.created_at} />
                <TimelineRow label="Sent" iso={comm.sent_at} />
                <TimelineRow label="Delivered" iso={comm.delivered_at} />
                <TimelineRow label="Read" iso={comm.read_at} />
                <TimelineRow label="Replied" iso={comm.replied_at} />
              </ul>
            </div>

            {comm.status === "sent" && comm.direction === "outbound" ? (
              <SimulateReplySection comm={comm} onClose={onClose} />
            ) : null}

            <Link
              href="/leads"
              className="mt-auto inline-flex items-center justify-center gap-2 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20"
            >
              View Lead
            </Link>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}

function TimelineRow({ label, iso }: { label: string; iso: string | null }) {
  return (
    <li className="flex items-center justify-between font-mono text-[11px]">
      <span className="text-[color:var(--color-text-muted)]">{label}</span>
      <span
        className={
          iso
            ? "text-[color:var(--color-text-secondary)]"
            : "text-[color:var(--color-text-muted)]/50"
        }
      >
        {iso ? new Date(iso).toLocaleString() : "—"}
      </span>
    </li>
  );
}

const INTENT_BUTTONS: {
  intent: ReplyIntent;
  label: string;
  hint: string;
  tone: string;
}[] = [
  {
    intent: "interested",
    label: "🟢 Interested",
    hint: "Yes, let's talk",
    tone: "border-[color:var(--color-neon-green)] text-[color:var(--color-neon-green)] hover:bg-[color:var(--color-neon-green)]/10",
  },
  {
    intent: "not_interested",
    label: "🔴 Not Interested",
    hint: "Pass / remove me",
    tone: "border-[color:var(--color-neon-red)] text-[color:var(--color-neon-red)] hover:bg-[color:var(--color-neon-red)]/10",
  },
  {
    intent: "objection",
    label: "🟡 Objection",
    hint: "Pricing / already have",
    tone: "border-[color:var(--color-neon-amber)] text-[color:var(--color-neon-amber)] hover:bg-[color:var(--color-neon-amber)]/10",
  },
  {
    intent: "question",
    label: "🤔 Question",
    hint: "Asks something",
    tone: "border-[color:var(--color-neon-purple)] text-[color:var(--color-neon-purple)] hover:bg-[color:var(--color-neon-purple)]/10",
  },
];

// Demo-only: injects a fake inbound reply so the Objection Handler pipeline
// can be exercised without a real recipient.
function SimulateReplySection({
  comm,
  onClose,
}: {
  comm: CommRow;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const [customIntent, setCustomIntent] = useState<ReplyIntent>("question");

  const fire = (intent: ReplyIntent, customReply?: string) => {
    if (pending) return;
    startTransition(async () => {
      try {
        await simulateInboundReply({
          comm_id: comm.id,
          intent,
          custom_reply: customReply,
        });
        toast.success("Reply simulated — Objection Handler dispatched");
        onClose();
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to simulate reply",
        );
      }
    });
  };

  return (
    <div className="mb-4 rounded-md border border-[color:var(--color-neon-amber-dim)] bg-[color:var(--color-neon-amber)]/5 p-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-neon-amber)]">
        🎬 Simulate Inbound Reply
      </div>
      <p className="mt-1 text-[10px] text-[color:var(--color-text-muted)]">
        Inject a fake reply to demo the post-send pipeline.
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {INTENT_BUTTONS.map((b) => (
          <button
            key={b.intent}
            type="button"
            disabled={pending}
            onClick={() => fire(b.intent)}
            className={
              "flex flex-col items-start gap-0.5 rounded-md border px-2.5 py-2 text-left font-mono text-[11px] transition disabled:cursor-not-allowed disabled:opacity-60 " +
              b.tone
            }
          >
            <span>{b.label}</span>
            <span className="text-[9px] text-[color:var(--color-text-muted)]">
              {b.hint}
            </span>
          </button>
        ))}
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() => setCustomOpen((v) => !v)}
        className="mt-2 w-full rounded-md border border-[color:var(--color-border-base)] px-2.5 py-2 font-mono text-[11px] text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-border-bright)] hover:text-[color:var(--color-text-primary)] disabled:opacity-60"
      >
        ✏️ Custom Reply
      </button>

      {customOpen ? (
        <div className="mt-2 space-y-2">
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            rows={3}
            placeholder="Type the lead's reply…"
            className="w-full rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/70 p-2 font-mono text-[11px] text-[color:var(--color-text-primary)] outline-none focus:border-[color:var(--color-neon-amber)]"
          />
          <div className="flex items-center gap-2">
            <select
              value={customIntent}
              onChange={(e) =>
                setCustomIntent(e.target.value as ReplyIntent)
              }
              className="flex-1 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/70 px-2 py-1.5 font-mono text-[11px] text-[color:var(--color-text-primary)] outline-none"
            >
              <option value="interested">Interested</option>
              <option value="not_interested">Not Interested</option>
              <option value="objection">Objection</option>
              <option value="question">Question</option>
            </select>
            <button
              type="button"
              disabled={pending || !customText.trim()}
              onClick={() => fire(customIntent, customText.trim())}
              className="rounded-md border border-[color:var(--color-neon-amber)] bg-[color:var(--color-neon-amber)]/10 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-[color:var(--color-neon-amber)] transition hover:bg-[color:var(--color-neon-amber)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Sending…" : "Submit"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
