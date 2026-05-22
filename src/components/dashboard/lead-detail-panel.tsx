"use client";

import { useState, useTransition } from "react";
import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";

import { updateLeadOutcome } from "@/app/(dashboard)/leads/actions";
import {
  CALL_OUTCOME_OPTIONS,
  type CallOutcome,
} from "@/types/database";

type DecidableOutcome = Exclude<CallOutcome, "pending_call">;

export type CallScript = { label: string; body: string };

const OUTCOME_BY_VALUE = Object.fromEntries(
  CALL_OUTCOME_OPTIONS.map((o) => [o.value, o]),
) as Record<CallOutcome, (typeof CALL_OUTCOME_OPTIONS)[number]>;

const OUTCOME_BUTTONS: ReadonlyArray<{
  value: DecidableOutcome;
  emoji: string;
  color: string;
  label: string;
}> = [
  { value: "confirmed", emoji: "✅", color: "#00ff88", label: "Confirmed" },
  { value: "rejected", emoji: "❌", color: "#ef4444", label: "Rejected" },
  { value: "follow_up", emoji: "⏳", color: "#fbbf24", label: "Pending" },
];

// Strip everything but digits for the wa.me deep link (country code, no +).
function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export function LeadDetailPanel({
  leadId,
  phone,
  initialOutcome,
  initialNotes,
  initialDraft,
  scripts,
}: {
  leadId: string;
  phone: string | null;
  initialOutcome: CallOutcome;
  initialNotes: string | null;
  initialDraft: string | null;
  scripts: CallScript[];
}) {
  const [outcome, setOutcome] = useState<CallOutcome>(initialOutcome);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [draft, setDraft] = useState<string | null>(initialDraft);
  const [pending, startTransition] = useTransition();
  const [scriptsOpen, setScriptsOpen] = useState(false);
  const [activeScript, setActiveScript] = useState(0);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);

  const currentMeta = OUTCOME_BY_VALUE[outcome];

  const onUpdate = (next: DecidableOutcome) => {
    const trimmed = notes.trim();
    if (!trimmed) {
      toast.error("Add a quick note about the call first.");
      return;
    }
    setOutcome(next);
    startTransition(async () => {
      try {
        const res = await updateLeadOutcome(leadId, next, trimmed);
        setDraft(res.follow_up_draft);
        toast.success("Saved. Follow-up ready to copy.");
        if (res.dealCreated) toast.success("✅ Deal created in /deals");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopiedDraft(true);
      setTimeout(() => setCopiedDraft(false), 1500);
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const copyScript = async () => {
    const s = scripts[activeScript];
    if (!s) return;
    try {
      await navigator.clipboard.writeText(s.body);
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 1500);
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const num = waNumber(phone);
  const waHref =
    num && draft
      ? `https://wa.me/${num}?text=${encodeURIComponent(draft)}`
      : num
        ? `https://wa.me/${num}`
        : null;

  return (
    <div className="space-y-5">
      {/* Big current-status badge */}
      <div className="space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
          Call outcome
        </span>
        <div
          className="flex items-center gap-2 rounded-md border px-4 py-3 font-mono text-sm uppercase tracking-[0.18em]"
          style={{
            borderColor: currentMeta.color,
            color: currentMeta.color,
            backgroundColor: `color-mix(in srgb, ${currentMeta.color} 12%, transparent)`,
          }}
        >
          <span className="text-lg" aria-hidden>
            {currentMeta.emoji}
          </span>
          {currentMeta.label.replace(/^[^ ]+ /, "")}
          {pending ? <Loader2 className="ml-auto size-4 animate-spin" /> : null}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <label
          htmlFor="detail_notes"
          className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]"
        >
          Call notes
        </label>
        <textarea
          id="detail_notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          placeholder="What happened on the call?"
          className="w-full resize-y rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-elevated)]/60 px-3 py-2 font-mono text-xs leading-relaxed text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_3px_var(--color-neon-green-dim)]"
        />
      </div>

      {/* Update outcome buttons */}
      <div className="space-y-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
          Update outcome
        </span>
        <div className="grid grid-cols-3 gap-2">
          {OUTCOME_BUTTONS.map((b) => {
            const active = outcome === b.value;
            return (
              <button
                key={b.value}
                type="button"
                onClick={() => onUpdate(b.value)}
                disabled={pending}
                className="flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 font-mono text-[10px] uppercase tracking-wider transition disabled:opacity-60"
                style={{
                  borderColor: active ? b.color : "var(--color-border-base)",
                  color: active ? b.color : "var(--color-text-secondary)",
                  backgroundColor: active
                    ? `color-mix(in srgb, ${b.color} 14%, transparent)`
                    : "transparent",
                }}
              >
                <span className="text-base" aria-hidden>
                  {b.emoji}
                </span>
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Call script — collapsible */}
      {scripts.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setScriptsOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-[color:var(--color-border-base)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-border-bright)]"
          >
            Call script ({scripts.length} languages)
            <span aria-hidden>{scriptsOpen ? "▲" : "▼"}</span>
          </button>
          {scriptsOpen ? (
            <div className="space-y-2 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/60 p-3">
              <div className="flex flex-wrap gap-1">
                {scripts.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => setActiveScript(i)}
                    className={
                      "rounded px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider transition " +
                      (activeScript === i
                        ? "bg-[color:var(--color-neon-green)]/20 text-[color:var(--color-neon-green)]"
                        : "text-[color:var(--color-text-muted)] hover:text-[color:var(--color-text-secondary)]")
                    }
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded bg-[color:var(--color-bg-elevated)]/50 p-2 font-mono text-[10px] leading-relaxed text-[color:var(--color-text-secondary)]">
                {scripts[activeScript]?.body}
              </pre>
              <button
                type="button"
                onClick={copyScript}
                className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-green)] hover:text-[color:var(--color-neon-green)]"
              >
                {copiedScript ? (
                  <Check className="size-3" />
                ) : (
                  <Copy className="size-3" />
                )}
                {copiedScript ? "Copied" : "Copy script"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Follow-up draft */}
      {draft ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
              Follow-up message
            </span>
            <button
              type="button"
              onClick={copyDraft}
              className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-green)] hover:text-[color:var(--color-neon-green)]"
            >
              {copiedDraft ? (
                <Check className="size-3" />
              ) : (
                <Copy className="size-3" />
              )}
              {copiedDraft ? "Copied" : "📋 Copy"}
            </button>
          </div>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-elevated)]/50 p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-text-secondary)]">
            {draft}
          </pre>
        </div>
      ) : (
        <p className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
          Pick an outcome above to generate a WhatsApp follow-up message.
        </p>
      )}

      {/* WhatsApp Web link */}
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[#25D366] bg-[#25D366]/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-[#25D366] transition hover:bg-[#25D366]/20"
        >
          <MessageCircle className="size-4" />
          Open WhatsApp Web
        </a>
      ) : (
        <p className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
          No phone number on file — can&apos;t open WhatsApp.
        </p>
      )}
    </div>
  );
}
