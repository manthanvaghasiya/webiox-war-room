import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";

import { TopBar } from "@/components/dashboard/topbar";
import {
  ScoreBadge,
  SolutionBadge,
  TierBadge,
} from "@/components/dashboard/lead-badges";
import {
  LeadDetailPanel,
  type CallScript,
} from "@/components/dashboard/lead-detail-panel";
import { createClient } from "@/lib/supabase/server";
import type { CallOutcome, Lead } from "@/types/database";

// Canonical 11-signal checklist. We can only see the signals that fired (the
// research_note SIGNALS line lists positives only), so each row is ✓ when its
// keyword appears in that line, ✗ otherwise. The last three are the Step 17
// deep-verification checks.
const SIGNAL_CHECKS: ReadonlyArray<{ label: string; test: RegExp }> = [
  { label: "Good rating", test: /★ rating/ },
  { label: "Review volume", test: /\d[\d,]*\s*reviews ✓/ },
  { label: "Working phone", test: /Phone available/ },
  { label: "Independent (not franchise)", test: /Independent/ },
  { label: "Recent reviews", test: /Recent reviews/ },
  { label: "Running paid ads", test: /Running (paid )?ads/ },
  { label: "Active Instagram", test: /Active Instagram/ },
  { label: "Email verified", test: /Email verified/ },
  { label: "Strong IG following (500+)", test: /IG followers ✓/ },
  { label: "Established domain (2y+)", test: /domain ✓/ },
  { label: "GST registered", test: /GST registered ✓/ },
];

function extractSignalsLine(note: string | null): string {
  if (!note) return "";
  const idx = note.indexOf("SIGNALS:");
  if (idx === -1) return "";
  const after = note.slice(idx + "SIGNALS:".length);
  const stop = after.indexOf("\n\n");
  return (stop === -1 ? after : after.slice(0, stop)).trim();
}

function parseCallScripts(note: string | null): CallScript[] {
  if (!note) return [];
  // Step 15 automation notes label the 2nd/3rd scripts "---ENGLISH---" and
  // "---ગુજરાતી---". Normalize them to the manual-scout marker so a single
  // split handles both formats.
  const normalized = note
    .replace(/---ENGLISH---/g, "---CALL SCRIPT (English)---")
    .replace(/---ગુજરાતી---/g, "---CALL SCRIPT (Gujarati)---");

  if (normalized.indexOf("---CALL SCRIPT") === -1) return [];

  const parts = normalized.split(/---CALL SCRIPT\s*/).filter(Boolean);
  const scripts: CallScript[] = [];
  for (const part of parts) {
    const headerEnd = part.indexOf("---");
    if (headerEnd === -1) continue;
    const label = part.slice(0, headerEnd).replace(/[()]/g, "").trim();
    const body = part.slice(headerEnd + 3).trim();
    if (label && body) scripts.push({ label, body });
  }
  return scripts;
}

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  const lead = data as Lead | null;
  if (!lead) notFound();

  const signalsLine = extractSignalsLine(lead.research_note);
  const scripts = parseCallScripts(lead.research_note);
  const outcome: CallOutcome = lead.call_outcome ?? "pending_call";

  const city = lead.location ?? "—";
  const websiteHost = (() => {
    if (!lead.website) return null;
    try {
      return new URL(lead.website).hostname.replace(/^www\./, "");
    } catch {
      return lead.website;
    }
  })();

  return (
    <>
      <TopBar title="Lead Detail" />
      <div className="space-y-4 p-6">
        <Link
          href="/leads"
          className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)] transition hover:text-[color:var(--color-neon-green)]"
        >
          <ArrowLeft className="size-3" />
          Back to leads
        </Link>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — lead intel */}
          <div className="panel space-y-5 p-6">
            <div className="space-y-1">
              <h1 className="font-mono text-lg uppercase tracking-[0.14em] text-[color:var(--color-text-primary)]">
                {lead.company ?? "Unknown"}
              </h1>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                <span>{lead.industry ?? "—"}</span>
                <span aria-hidden>·</span>
                <span>{city}</span>
              </div>
            </div>

            <dl className="space-y-3">
              <IntelRow label="Phone">
                {lead.phone ? (
                  <a
                    href={`tel:${lead.phone.replace(/\s/g, "")}`}
                    className="font-mono text-xs text-[color:var(--color-neon-green)] hover:underline"
                  >
                    {lead.phone}
                  </a>
                ) : (
                  <Dash />
                )}
              </IntelRow>

              <IntelRow label="Address">
                {lead.address ? (
                  <a
                    href={
                      lead.google_maps_url ??
                      `https://maps.google.com/?q=${encodeURIComponent(lead.address)}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 font-mono text-xs text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-neon-green)]"
                  >
                    {lead.address}
                    <ExternalLink className="mt-0.5 size-3 shrink-0" />
                  </a>
                ) : (
                  <Dash />
                )}
              </IntelRow>

              <IntelRow label="Rating">
                {lead.google_rating ? (
                  <span className="font-mono text-xs text-[color:var(--color-text-secondary)]">
                    {lead.google_rating}★
                    {lead.review_count
                      ? ` · ${lead.review_count} reviews`
                      : ""}
                  </span>
                ) : (
                  <Dash />
                )}
              </IntelRow>

              <IntelRow label="Website">
                {websiteHost ? (
                  <a
                    href={lead.website ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-xs text-[color:var(--color-neon-green)] hover:underline"
                  >
                    🌐 {websiteHost}
                    <ExternalLink className="size-3" />
                  </a>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                    style={{
                      color: "var(--color-neon-red)",
                      backgroundColor:
                        "color-mix(in srgb, var(--color-neon-red) 18%, transparent)",
                    }}
                  >
                    🔴 No website
                  </span>
                )}
              </IntelRow>

              <IntelRow label="Recommended">
                <SolutionBadge solution={lead.recommended_solution} />
              </IntelRow>

              <IntelRow label="Tier / Score">
                <span className="flex items-center gap-2">
                  <TierBadge score={lead.lead_score} />
                  <ScoreBadge
                    score={lead.lead_score}
                    reason={lead.lead_score_reason}
                  />
                </span>
              </IntelRow>
            </dl>

            {/* 8 signal checks */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                Signal checks
              </span>
              <ul className="grid grid-cols-2 gap-1.5">
                {SIGNAL_CHECKS.map((s) => {
                  const ok = s.test.test(signalsLine);
                  return (
                    <li
                      key={s.label}
                      className="flex items-center gap-1.5 font-mono text-[10px]"
                      style={{
                        color: ok
                          ? "var(--color-neon-green)"
                          : "var(--color-text-muted)",
                      }}
                    >
                      <span aria-hidden>{ok ? "✓" : "✗"}</span>
                      {s.label}
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Step 17 — deep verification (Instagram / domain / GST) */}
            <div className="space-y-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                🔍 Deep verification
              </span>
              <dl className="space-y-2.5">
                <IntelRow label="Instagram">
                  {lead.instagram_handle ? (
                    <a
                      href={`https://instagram.com/${lead.instagram_handle}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-mono text-xs text-[color:var(--color-neon-green)] hover:underline"
                    >
                      @{lead.instagram_handle}
                      {lead.instagram_followers != null
                        ? ` · ${lead.instagram_followers.toLocaleString("en-IN")} followers`
                        : ""}
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    <Dash />
                  )}
                </IntelRow>

                <IntelRow label="Domain age">
                  {lead.domain_age_years != null ? (
                    <span className="font-mono text-xs text-[color:var(--color-text-secondary)]">
                      {websiteHost ? `${websiteHost} · ` : ""}
                      {lead.domain_age_years} years old
                    </span>
                  ) : (
                    <Dash />
                  )}
                </IntelRow>

                <IntelRow label="GST">
                  {lead.gstin ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-[color:var(--color-text-secondary)]">
                      <span>{lead.gstin}</span>
                      {lead.gst_verified ? (
                        <span style={{ color: "var(--color-neon-green)" }}>
                          ✓
                        </span>
                      ) : null}
                    </span>
                  ) : (
                    <span className="font-mono text-xs text-[color:var(--color-text-muted)]">
                      Not detected
                    </span>
                  )}
                </IntelRow>
              </dl>
            </div>

            {/* Why reason */}
            {lead.solution_reason ? (
              <div className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  Why this lead
                </span>
                <p className="font-mono text-xs leading-relaxed text-[color:var(--color-text-secondary)]">
                  {lead.solution_reason}
                </p>
              </div>
            ) : null}
          </div>

          {/* RIGHT — action panel */}
          <div className="panel p-6">
            <LeadDetailPanel
              leadId={lead.id}
              phone={lead.phone}
              initialOutcome={outcome}
              initialNotes={lead.call_notes}
              initialDraft={lead.follow_up_draft}
              scripts={scripts}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function IntelRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[color:var(--color-border-base)]/50 pb-2.5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="max-w-[60%] text-right">{children}</dd>
    </div>
  );
}

function Dash() {
  return (
    <span className="font-mono text-xs text-[color:var(--color-text-muted)]">
      —
    </span>
  );
}
