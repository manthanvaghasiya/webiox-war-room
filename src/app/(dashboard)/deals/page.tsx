import { TopBar } from "@/components/dashboard/topbar";
import { createClient } from "@/lib/supabase/server";
import type { DealStage } from "@/types/database";

// Pipeline columns in flow order. Each card moves left → right as it closes.
const STAGES: ReadonlyArray<{
  id: DealStage;
  label: string;
  color: string;
}> = [
  { id: "proposal", label: "Proposal", color: "#00ff88" },
  { id: "negotiation", label: "Negotiation", color: "#fbbf24" },
  { id: "verbal_yes", label: "Verbal Yes", color: "#a855f7" },
  { id: "contract_sent", label: "Contract Sent", color: "#00ffff" },
  { id: "closed_won", label: "Closed Won", color: "#00ff88" },
  { id: "closed_lost", label: "Closed Lost", color: "#ef4444" },
];

type DealCard = {
  id: string;
  company: string;
  contact_name: string | null;
  deal_value: number;
  stage: DealStage;
  notes: string | null;
  created_at: string;
  leads: { call_notes: string | null } | { call_notes: string | null }[] | null;
};

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);
}

// A deal that was auto-created from a confirmed call carries this marker in its
// notes — used to show the "Confirmed from /leads call outcome" source line.
const CONFIRM_MARKER = "Confirmed from /leads call outcome";

function callNotesExcerpt(deal: DealCard): string | null {
  const joined = Array.isArray(deal.leads) ? deal.leads[0] : deal.leads;
  const fromLead = joined?.call_notes?.trim();
  if (fromLead) return fromLead;
  // Fall back to the notes excerpt embedded at deal-creation time.
  const idx = deal.notes?.indexOf("Notes:");
  if (deal.notes && idx !== undefined && idx !== -1) {
    return deal.notes.slice(idx + "Notes:".length).trim() || null;
  }
  return null;
}

export default async function DealsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data } = await supabase
    .from("deals")
    .select(
      "id, company, contact_name, deal_value, stage, notes, created_at, leads(call_notes)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const deals = (data as DealCard[] | null) ?? [];

  const byStage = (stage: DealStage) =>
    deals.filter((d) => d.stage === stage);

  const totalValue = deals
    .filter((d) => d.stage !== "closed_lost")
    .reduce((acc, d) => acc + Number(d.deal_value ?? 0), 0);

  return (
    <>
      <TopBar title="Pipeline" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // pipeline · {deals.length} deal{deals.length === 1 ? "" : "s"} ·{" "}
            {formatCurrency(totalValue)} open
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        {deals.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
              No deals yet
            </p>
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              Confirm a lead on the Leads page — it auto-creates a deal here.
            </p>
          </div>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.map((stage) => {
              const stageDeals = byStage(stage.id);
              const stageValue = stageDeals.reduce(
                (acc, d) => acc + Number(d.deal_value ?? 0),
                0,
              );
              return (
                <div
                  key={stage.id}
                  className="flex w-72 shrink-0 flex-col gap-3"
                >
                  <div
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                    style={{
                      borderColor: stage.color,
                      backgroundColor: `color-mix(in srgb, ${stage.color} 10%, transparent)`,
                    }}
                  >
                    <span
                      className="font-mono text-[10px] uppercase tracking-[0.22em]"
                      style={{ color: stage.color }}
                    >
                      {stage.label}
                    </span>
                    <span className="font-mono-num text-[10px] text-[color:var(--color-text-muted)]">
                      {stageDeals.length} · {formatCurrency(stageValue)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-3">
                    {stageDeals.map((d) => {
                      const excerpt = callNotesExcerpt(d);
                      const fromConfirm = d.notes?.includes(CONFIRM_MARKER);
                      return (
                        <div
                          key={d.id}
                          className="panel space-y-2 p-4"
                          style={{ borderLeft: `2px solid ${stage.color}` }}
                        >
                          <div className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-text-primary)]">
                            {d.company}
                          </div>
                          <div
                            className="font-mono-num text-lg font-semibold"
                            style={{ color: stage.color }}
                          >
                            {formatCurrency(Number(d.deal_value ?? 0))}
                          </div>
                          {d.contact_name ? (
                            <div className="font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                              {d.contact_name}
                            </div>
                          ) : null}
                          {fromConfirm ? (
                            <div className="font-mono text-[9px] uppercase tracking-wider text-[color:var(--color-neon-green)]">
                              ✅ Confirmed from /leads call outcome
                            </div>
                          ) : null}
                          {excerpt ? (
                            <p className="line-clamp-3 font-mono text-[10px] leading-snug text-[color:var(--color-text-muted)]">
                              “{excerpt}”
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                    {stageDeals.length === 0 ? (
                      <div className="rounded-md border border-dashed border-[color:var(--color-border-base)]/60 px-3 py-6 text-center font-mono text-[10px] text-[color:var(--color-text-muted)]">
                        empty
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
