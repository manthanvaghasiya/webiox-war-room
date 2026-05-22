import Link from "next/link";

import { TopBar } from "@/components/dashboard/topbar";
import {
  LeadsTable,
  type LeadRow,
  type TierFilter,
} from "@/components/dashboard/leads-table";
import { AgentActionInline } from "@/components/dashboard/agent-action-buttons";
import { createClient } from "@/lib/supabase/server";
import { SOLUTIONS, type SolutionType } from "@/types/database";

// Filter pills exclude 'none' — only the five pitchable solutions.
const FILTER_SOLUTIONS = SOLUTIONS.filter((s) => s.id !== "none");

function isSolution(v: string | undefined): v is SolutionType {
  return !!v && SOLUTIONS.some((s) => s.id === v);
}

function isTier(v: string | undefined): v is TierFilter {
  return v === "confirmed" || v === "probable" || v === "all";
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{
    solution?: string;
    pipeline?: string;
    tier?: string;
  }>;
}) {
  const { solution, pipeline, tier } = await searchParams;
  const pipelineReady = pipeline === "1";
  // Pipeline-ready view takes precedence over a solution filter.
  const activeSolution =
    !pipelineReady && isSolution(solution) ? solution : null;
  const activeTier: TierFilter = isTier(tier) ? tier : "all";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data } = await supabase
    .from("leads")
    .select(
      "id,first_name,last_name,full_name,company,job_title,email,email_verified,phone,address,website,research_note,recommended_solution,solution_reason,status,lead_score,lead_score_reason,segment,created_at,call_outcome,call_notes,follow_up_draft,google_rating,review_count",
    )
    .eq("user_id", userId)
    .order("lead_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const leads: LeadRow[] = (data as LeadRow[] | null) ?? [];

  const countFor = (id: SolutionType) =>
    leads.filter((l) => l.recommended_solution === id).length;
  const pipelineCount = leads.filter((l) => l.lead_score >= 70).length;
  const confirmedCount = leads.filter((l) => l.lead_score >= 75).length;
  const probableCount = leads.filter(
    (l) => l.lead_score >= 50 && l.lead_score < 75,
  ).length;

  // Preserve solution/pipeline state when toggling tier pills.
  const tierHref = (t: TierFilter) => {
    const params = new URLSearchParams();
    if (pipelineReady) params.set("pipeline", "1");
    else if (activeSolution) params.set("solution", activeSolution);
    if (t !== "all") params.set("tier", t);
    const qs = params.toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  return (
    <>
      <TopBar title="Leads" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // intake · {leads.length} lead{leads.length === 1 ? "" : "s"}
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        {/* Filter pills + Enrich All New */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              href="/leads"
              label="All"
              count={leads.length}
              active={activeSolution === null && !pipelineReady}
              color="var(--color-neon-green)"
            />
            {FILTER_SOLUTIONS.map((s) => (
              <FilterPill
                key={s.id}
                href={`/leads?solution=${s.id}`}
                label={`${s.emoji} ${s.label}`}
                count={countFor(s.id)}
                active={activeSolution === s.id}
                color={s.color}
              />
            ))}
            <FilterPill
              href="/leads?pipeline=1"
              label="🎯 Pipeline Ready"
              count={pipelineCount}
              active={pipelineReady}
              color="#00ff88"
            />
          </div>
          <div className="ml-auto">
            <AgentActionInline
              agentId="data_enricher"
              label="🔁 Enrich All New"
            />
          </div>
        </div>

        {/* Tier filter pills — narrows the table by confidence tier. */}
        <div className="flex flex-wrap items-center gap-2">
          <FilterPill
            href={tierHref("all")}
            label="All Tiers"
            count={leads.length}
            active={activeTier === "all"}
            color="var(--color-neon-green)"
          />
          <FilterPill
            href={tierHref("confirmed")}
            label="🟢 Confirmed only"
            count={confirmedCount}
            active={activeTier === "confirmed"}
            color="#00ff88"
          />
          <FilterPill
            href={tierHref("probable")}
            label="🟡 Probable only"
            count={probableCount}
            active={activeTier === "probable"}
            color="#fbbf24"
          />
        </div>

        <LeadsTable
          userId={userId}
          initialLeads={leads}
          activeSolution={activeSolution}
          pipelineReady={pipelineReady}
          tierFilter={activeTier}
        />
      </div>
    </>
  );
}

function FilterPill({
  href,
  label,
  count,
  active,
  color,
}: {
  href: string;
  label: string;
  count: number;
  active: boolean;
  color: string;
}) {
  return (
    <Link
      href={href}
      className={
        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[11px] transition " +
        (active
          ? ""
          : "border-[color:var(--color-border-base)] text-[color:var(--color-text-secondary)] hover:border-[color:var(--color-border-bright)] hover:text-[color:var(--color-text-primary)]")
      }
      style={
        active
          ? {
              borderColor: color,
              color,
              backgroundColor:
                "color-mix(in srgb, var(--color-bg-elevated) 75%, transparent)",
            }
          : undefined
      }
    >
      <span>{label}</span>
      <span
        className="rounded-sm px-1 font-mono-num text-[10px]"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--color-bg-base) 70%, transparent)",
          color: active ? color : "var(--color-text-muted)",
        }}
      >
        {count}
      </span>
    </Link>
  );
}
