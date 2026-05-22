"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

import { updateLeadOutcome } from "@/app/(dashboard)/leads/actions";
import {
  CALL_OUTCOME_OPTIONS,
  type CallOutcome,
} from "@/types/database";

export type DrawerLead = {
  id: string;
  company: string | null;
  phone: string | null;
  google_rating: number | null;
  review_count: number | null;
  recommended_solution: string | null;
  call_outcome: CallOutcome | null;
  call_notes: string | null;
  follow_up_draft: string | null;
};

type DecidableOutcome = Exclude<CallOutcome, "pending_call">;

// Only the three decidable outcomes are user-selectable (skip "Not Called").
const DECIDABLE = CALL_OUTCOME_OPTIONS.filter(
  (o) => o.value !== "pending_call",
) as ReadonlyArray<{
  value: DecidableOutcome;
  label: string;
  color: string;
  emoji: string;
}>;

const notesKey = (leadId: string) => `lead-call-notes:${leadId}`;

export function LeadCallDrawer({
  lead,
  open,
  initialOutcome,
  onClose,
}: {
  lead: DrawerLead | null;
  open: boolean;
  initialOutcome: DecidableOutcome;
  onClose: () => void;
}) {
  const [outcome, setOutcome] = useState<DecidableOutcome>(initialOutcome);
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generating, startGenerate] = useTransition();
  const [saving, startSave] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Snapshot of the {outcome, notes} that were last persisted — lets Save &
  // Close skip a redundant (and costly) second AI call when nothing changed.
  const savedSnapshot = useRef<{ outcome: string; notes: string } | null>(null);

  // (Re)hydrate form state whenever the drawer opens for a (new) lead. Notes
  // prefer the localStorage draft so unsaved work survives an accidental close.
  useEffect(() => {
    if (!open || !lead) return;
    setOutcome(initialOutcome);
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(notesKey(lead.id))
        : null;
    setNotes(stored ?? lead.call_notes ?? "");
    setDraft(lead.follow_up_draft ?? null);
    savedSnapshot.current = null;
    setCopied(false);
    // Autofocus the textarea once the slide-in settles.
    const t = setTimeout(() => textareaRef.current?.focus(), 250);
    return () => clearTimeout(t);
  }, [open, lead, initialOutcome]);

  // Persist notes to localStorage as the user types (per lead).
  useEffect(() => {
    if (!open || !lead) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(notesKey(lead.id), notes);
  }, [notes, open, lead]);

  if (!lead) return null;

  const clearStoredNotes = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(notesKey(lead.id));
    }
  };

  const runAction = async (): Promise<string | null> => {
    const trimmed = notes.trim();
    if (!trimmed) {
      toast.error("Add a quick note about the call first.");
      return null;
    }
    const res = await updateLeadOutcome(lead.id, outcome, trimmed);
    savedSnapshot.current = { outcome, notes: trimmed };
    if (res.dealCreated) toast.success("✅ Deal created in /deals");
    return res.follow_up_draft;
  };

  const onGenerate = () => {
    startGenerate(async () => {
      try {
        const d = await runAction();
        if (d !== null) {
          setDraft(d);
          toast.success("Saved. Follow-up ready to copy.");
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
    });
  };

  const onSaveAndClose = () => {
    const trimmed = notes.trim();
    const snap = savedSnapshot.current;
    const unchanged =
      snap && snap.outcome === outcome && snap.notes === trimmed;
    // Already persisted with the same content — just close, no extra AI call.
    if (unchanged) {
      clearStoredNotes();
      onClose();
      return;
    }
    startSave(async () => {
      try {
        const d = await runAction();
        if (d !== null) {
          toast.success("Saved. Follow-up ready to copy.");
          clearStoredNotes();
          onClose();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Save failed");
      }
    });
  };

  const onCopy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Clipboard blocked");
    }
  };

  const busy = generating || saving;

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={busy ? undefined : onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Call outcome"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)] shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.25, ease: "easeOut" }}
          >
            {/* Header — lead summary */}
            <div className="flex items-start justify-between gap-3 border-b border-[color:var(--color-border-base)] p-5">
              <div className="min-w-0 space-y-1">
                <h2 className="truncate font-mono text-sm uppercase tracking-[0.18em] text-[color:var(--color-text-primary)]">
                  {lead.company ?? "Unknown"}
                </h2>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                  {lead.phone ? <span>{lead.phone}</span> : null}
                  {lead.google_rating ? (
                    <span>
                      {lead.google_rating}★
                      {lead.review_count ? ` · ${lead.review_count} reviews` : ""}
                    </span>
                  ) : null}
                </div>
                {lead.recommended_solution ? (
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[color:var(--color-neon-green)]">
                    {lead.recommended_solution.replace("_", " ")}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close"
                className="shrink-0 rounded p-1 text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-text-primary)] disabled:opacity-50"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* Outcome radio group */}
              <div className="space-y-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  Outcome
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {DECIDABLE.map((o) => {
                    const active = outcome === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => setOutcome(o.value)}
                        className="flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 font-mono text-[10px] uppercase tracking-wider transition"
                        style={{
                          borderColor: active
                            ? o.color
                            : "var(--color-border-base)",
                          color: active ? o.color : "var(--color-text-secondary)",
                          backgroundColor: active
                            ? `color-mix(in srgb, ${o.color} 14%, transparent)`
                            : "transparent",
                        }}
                      >
                        <span className="text-base" aria-hidden>
                          {o.emoji}
                        </span>
                        {o.label.replace(/^[^ ]+ /, "")}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <label
                  htmlFor="call_notes"
                  className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]"
                >
                  Call notes — what happened?
                </label>
                <textarea
                  id="call_notes"
                  ref={textareaRef}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={5}
                  placeholder="e.g. Owner interested, wants website + WhatsApp catalog. Asked for pricing. Call back Friday."
                  className="w-full resize-y rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-elevated)]/60 px-3 py-2 font-mono text-xs leading-relaxed text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_3px_var(--color-neon-green-dim)]"
                />
                <p className="font-mono text-[9px] text-[color:var(--color-text-muted)]">
                  Draft auto-saved locally — won&apos;t be lost if you close.
                </p>
              </div>

              {/* Generate */}
              <button
                type="button"
                onClick={onGenerate}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-neon-purple)] bg-[color:var(--color-neon-purple)]/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-purple)] transition hover:bg-[color:var(--color-neon-purple)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {generating ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Generating…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-4" />
                    Generate Follow-up
                  </>
                )}
              </button>

              {/* Generated draft */}
              {draft ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                      Follow-up message
                    </span>
                    <button
                      type="button"
                      onClick={onCopy}
                      className="inline-flex items-center gap-1 rounded border border-[color:var(--color-border-base)] px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-text-secondary)] transition hover:border-[color:var(--color-neon-green)] hover:text-[color:var(--color-neon-green)]"
                    >
                      {copied ? (
                        <Check className="size-3" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                      {copied ? "Copied" : "📋 Copy"}
                    </button>
                  </div>
                  <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-elevated)]/50 p-3 font-mono text-[11px] leading-relaxed text-[color:var(--color-text-secondary)]">
                    {draft}
                  </pre>
                </div>
              ) : null}
            </div>

            {/* Footer */}
            <div className="border-t border-[color:var(--color-border-base)] p-5">
              <button
                type="button"
                onClick={onSaveAndClose}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 px-4 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "💾 Save & Close"
                )}
              </button>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
