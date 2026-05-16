import { formatDistanceToNow } from "date-fns";

import { TopBar } from "@/components/dashboard/topbar";
import { ScoreBadge, SolutionBadge } from "@/components/dashboard/lead-badges";
import { AgentActionInline } from "@/components/dashboard/agent-action-buttons";
import { createClient } from "@/lib/supabase/server";
import type { QualifiedStatus, SolutionType } from "@/types/database";

type QualifiedRow = {
  id: string;
  qualification_reason: string | null;
  pain_points: string[] | null;
  status: QualifiedStatus;
  created_at: string;
  lead: {
    first_name: string | null;
    last_name: string | null;
    full_name: string | null;
    company: string | null;
    phone: string | null;
    lead_score: number;
    lead_score_reason: string | null;
    recommended_solution: SolutionType | null;
  } | null;
};

const STATUS_TONE: Record<QualifiedStatus, string> = {
  new: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-secondary)]",
  call_booked:
    "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  call_completed:
    "bg-[color:var(--color-neon-purple-dim)] text-[color:var(--color-neon-purple)]",
  proposal_sent:
    "bg-[color:var(--color-neon-purple-dim)] text-[color:var(--color-neon-purple)]",
  negotiating:
    "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  closed_won:
    "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  closed_lost:
    "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
};

export default async function QualifiedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data } = await supabase
    .from("qualified_leads")
    .select(
      "id,qualification_reason,pain_points,status,created_at,lead:leads(first_name,last_name,full_name,company,phone,lead_score,lead_score_reason,recommended_solution)",
    )
    .eq("user_id", userId);

  const rows = ((data as QualifiedRow[] | null) ?? [])
    .slice()
    .sort((a, b) => (b.lead?.lead_score ?? 0) - (a.lead?.lead_score ?? 0));

  return (
    <>
      <TopBar title="Qualified" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // pipeline · {rows.length} qualified lead
            {rows.length === 1 ? "" : "s"}
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        {rows.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
              No qualified leads yet.
            </p>
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              Run the Lead Qualifier on your leads page first.
            </p>
            <AgentActionInline
              agentId="lead_qualifier"
              label="Initiate Lead Qualifier"
            />
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  <th className="px-4 py-3 font-normal">Name</th>
                  <th className="px-4 py-3 font-normal">Company</th>
                  <th className="px-4 py-3 font-normal">Phone</th>
                  <th className="px-4 py-3 font-normal text-right">Score</th>
                  <th className="px-4 py-3 font-normal">Solution</th>
                  <th className="px-4 py-3 font-normal">Pain Points</th>
                  <th className="px-4 py-3 font-normal">Qualification Reason</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal text-right">Promoted</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const lead = r.lead;
                  const name =
                    lead?.full_name ||
                    [lead?.first_name, lead?.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    "—";
                  return (
                    <tr
                      key={r.id}
                      className="border-b border-[color:var(--color-border-base)]/60 align-top last:border-0 hover:bg-[color:var(--color-bg-elevated)]/40"
                    >
                      <td className="px-4 py-3 text-xs text-[color:var(--color-text-primary)]">
                        {name}
                      </td>
                      <td className="px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
                        {lead?.company ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {lead?.phone ? (
                          <span className="font-mono text-[11px] text-[color:var(--color-text-secondary)]">
                            {lead.phone}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <ScoreBadge
                          score={lead?.lead_score ?? 0}
                          reason={lead?.lead_score_reason}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <SolutionBadge
                          solution={lead?.recommended_solution ?? null}
                        />
                      </td>
                      <td className="max-w-[220px] px-4 py-3">
                        {r.pain_points && r.pain_points.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {r.pain_points.map((p, i) => (
                              <span
                                key={i}
                                className="rounded-sm bg-[color:var(--color-bg-elevated)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-text-secondary)]"
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
                            —
                          </span>
                        )}
                      </td>
                      <td className="max-w-[260px] px-4 py-3">
                        <span
                          className="line-clamp-2 font-mono text-[10px] leading-snug text-[color:var(--color-text-secondary)]"
                          title={r.qualification_reason ?? undefined}
                        >
                          {r.qualification_reason ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                            STATUS_TONE[r.status]
                          }
                        >
                          {r.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-[color:var(--color-text-muted)]">
                        {formatDistanceToNow(new Date(r.created_at), {
                          addSuffix: true,
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
