import Link from "next/link";
import { Activity } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/dashboard/topbar";
import { Sparkline } from "@/components/dashboard/sparkline";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AgentActionButtons } from "@/components/dashboard/agent-action-buttons";
import { SOLUTIONS, type AgentLog, type SolutionType } from "@/types/database";

function startOfMonthISO() {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchMissionStats(userId: string) {
  const supabase = await createClient();
  const monthISO = startOfMonthISO();

  const [pipeline, closedMonth, activeLeads, activeClients] = await Promise.all([
    supabase
      .from("deals")
      .select("deal_value")
      .eq("user_id", userId)
      .not("stage", "in", "(closed_won,closed_lost)"),
    supabase
      .from("deals")
      .select("deal_value")
      .eq("user_id", userId)
      .eq("stage", "closed_won")
      .gte("closed_at", monthISO),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("status", "in", "(not_interested,invalid,cold)"),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);

  const sum = (rows: { deal_value: number | null }[] | null) =>
    (rows ?? []).reduce((acc, r) => acc + Number(r.deal_value ?? 0), 0);

  return {
    pipelineValue: sum(pipeline.data),
    closedThisMonth: sum(closedMonth.data),
    activeLeads: activeLeads.count ?? 0,
    activeClients: activeClients.count ?? 0,
  };
}

// Lead counts per recommended_solution — drives the SOLUTION OPPORTUNITIES row.
async function fetchSolutionCounts(
  userId: string,
): Promise<Record<SolutionType, number>> {
  const supabase = await createClient();
  const ids = SOLUTIONS.filter((s) => s.id !== "none").map((s) => s.id);
  const results = await Promise.all(
    ids.map((id) =>
      supabase
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("recommended_solution", id),
    ),
  );
  const counts = Object.fromEntries(
    SOLUTIONS.map((s) => [s.id, 0]),
  ) as Record<SolutionType, number>;
  ids.forEach((id, i) => {
    counts[id] = results[i].count ?? 0;
  });
  return counts;
}

// Communication counts per status — drives the CAMPAIGN STATUS row.
const CAMPAIGN_STATS = [
  { status: "queued", emoji: "📨", label: "Queued", color: "var(--color-neon-amber)" },
  { status: "sent", emoji: "✅", label: "Sent", color: "var(--color-neon-green)" },
  { status: "replied", emoji: "💬", label: "Replied", color: "var(--color-neon-purple)" },
  { status: "failed", emoji: "❌", label: "Failed", color: "var(--color-neon-red)" },
] as const;

async function fetchCampaignCounts(
  userId: string,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const results = await Promise.all(
    CAMPAIGN_STATS.map((s) =>
      supabase
        .from("communications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("status", s.status),
    ),
  );
  const counts: Record<string, number> = {};
  CAMPAIGN_STATS.forEach((s, i) => {
    counts[s.status] = results[i].count ?? 0;
  });
  return counts;
}

async function fetchRecentLogs(userId: string): Promise<AgentLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_logs")
    .select(
      "id,user_id,agent,action,target_table,target_id,level,message,metadata,tokens_used,cost_usd,created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data as AgentLog[] | null) ?? [];
}

const SPARK_DATA = {
  pipeline: [4, 6, 5, 8, 9, 11, 10, 13, 12, 15, 14, 18],
  closed: [1, 0, 2, 1, 3, 2, 4, 3, 5, 6, 5, 7],
  leads: [12, 14, 11, 18, 16, 22, 20, 26, 24, 30, 28, 34],
  clients: [3, 3, 4, 4, 5, 5, 5, 6, 6, 7, 7, 7],
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function CommandCenterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const [stats, logs, solutionCounts, campaignCounts] = await Promise.all([
    fetchMissionStats(userId),
    fetchRecentLogs(userId),
    fetchSolutionCounts(userId),
    fetchCampaignCounts(userId),
  ]);

  const cards: {
    label: string;
    value: string;
    spark: number[];
    tint: string;
  }[] = [
    { label: "Pipeline Value",    value: formatCurrency(stats.pipelineValue),    spark: SPARK_DATA.pipeline, tint: "var(--color-neon-green)" },
    { label: "Closed This Month", value: formatCurrency(stats.closedThisMonth),  spark: SPARK_DATA.closed,   tint: "var(--color-neon-purple)" },
    { label: "Active Leads",      value: stats.activeLeads.toString(),           spark: SPARK_DATA.leads,    tint: "var(--color-neon-amber)" },
    { label: "Active Clients",    value: stats.activeClients.toString(),         spark: SPARK_DATA.clients,  tint: "var(--color-neon-green)" },
  ];

  return (
    <>
      <TopBar title="Command Center" />

      <div className="space-y-8 p-6">
        {/* MISSION CONTROL */}
        <section>
          <SectionHeading>Mission Control</SectionHeading>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {cards.map((c) => (
              <div
                key={c.label}
                className="panel relative overflow-hidden p-6"
                style={{ borderBottom: `2px solid ${c.tint}` }}
              >
                <div className="text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  {c.label}
                </div>
                <div
                  className="font-mono-num mt-2 text-3xl font-semibold"
                  style={{ color: c.tint }}
                >
                  {c.value}
                </div>
                <div className="mt-3">
                  <Sparkline data={c.spark} color={c.tint} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* SOLUTION OPPORTUNITIES */}
        <section>
          <SectionHeading>Solution Opportunities</SectionHeading>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {SOLUTIONS.filter((s) => s.id !== "none").map((s) => (
              <Link
                key={s.id}
                href={`/leads?solution=${s.id}`}
                className="panel flex items-center gap-3 p-4 transition hover:border-[color:var(--color-border-bright)]"
                style={{ borderLeft: `2px solid ${s.color}` }}
              >
                <span aria-hidden className="text-xl leading-none">
                  {s.emoji}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
                    {s.label}
                  </div>
                  <div
                    className="font-mono-num text-xl font-semibold"
                    style={{ color: s.color }}
                  >
                    {solutionCounts[s.id]}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* CAMPAIGN STATUS */}
        <section>
          <SectionHeading>Campaign Status</SectionHeading>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {CAMPAIGN_STATS.map((s) => (
              <Link
                key={s.status}
                href={`/comms?status=${s.status}`}
                className="panel flex items-center gap-3 p-4 transition hover:border-[color:var(--color-border-bright)]"
                style={{ borderLeft: `2px solid ${s.color}` }}
              >
                <span aria-hidden className="text-xl leading-none">
                  {s.emoji}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]">
                    {s.label}
                  </div>
                  <div
                    className="font-mono-num text-xl font-semibold"
                    style={{ color: s.color }}
                  >
                    {campaignCounts[s.status] ?? 0}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* AGENT ACTIVITY */}
        <section>
          <SectionHeading>Agent Activity</SectionHeading>
          <div className="panel flex flex-col gap-5 p-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:var(--color-neon-green-dim)] bg-[color:var(--color-neon-green-dim)]/30 text-[color:var(--color-neon-green)]">
                <Activity className="size-4" />
              </div>
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
                  Manual dispatch
                </p>
                <p className="text-xs text-[color:var(--color-text-secondary)]">
                  Pick an operative to run now
                </p>
              </div>
            </div>
            <AgentActionButtons />
          </div>
        </section>

        {/* RECENT EVENTS */}
        <section>
          <SectionHeading>Recent Events</SectionHeading>
          <ActivityFeed userId={userId} initialLogs={logs} />
        </section>
      </div>
    </>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
        // {children}
      </span>
      <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
    </div>
  );
}
