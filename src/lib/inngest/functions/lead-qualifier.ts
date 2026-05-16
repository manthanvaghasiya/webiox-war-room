import { inngest, leadQualifierEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import {
  buildScoreReason,
  isPipelineReady,
  scoreLeadRuleBased,
} from "@/lib/agents/qualifier-helpers";
import type { Lead } from "@/types/database";

const MAX_LEADS_PER_RUN = 100;

type PromotionRow = {
  lead_id: string;
  user_id: string;
  qualification_reason: string;
  pain_points: string[];
  status: "new";
};

export const leadQualifierFn = inngest.createFunction(
  {
    id: "lead-qualifier",
    name: "Lead Qualifier",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: leadQualifierEvent }],
  },
  async ({ event }) => {
    if (!event.data?.user_id) throw new Error("user_id required");
    const userId = event.data.user_id;
    const requestedIds = event.data.lead_ids;

    return await runAgent(
      "lead_qualifier",
      userId,
      "Score and qualify leads",
      async (ctx) => {
        // Fetch leads to score — explicit ids if given, else all 'new' leads.
        const query =
          requestedIds && requestedIds.length > 0
            ? ctx.supabase
                .from("leads")
                .select("*")
                .eq("user_id", userId)
                .in("id", requestedIds)
            : ctx.supabase
                .from("leads")
                .select("*")
                .eq("user_id", userId)
                .eq("status", "new")
                .limit(MAX_LEADS_PER_RUN);

        const { data, error } = await query;
        if (error) throw new Error(`Fetch leads failed: ${error.message}`);

        const leads = (data as Lead[] | null) ?? [];
        if (leads.length === 0) {
          await ctx.log("No leads to qualify", {
            action: "noop",
            level: "info",
          });
          return { scored: 0, qualified: 0 };
        }

        await ctx.log(
          `Scoring ${leads.length} leads with rule-based engine…`,
          { action: "qualify_start", metadata: { count: leads.length } },
        );

        let scored = 0;
        let qualified = 0;
        const promotions: PromotionRow[] = [];

        for (const lead of leads) {
          const breakdown = scoreLeadRuleBased(lead);
          const reason = buildScoreReason(breakdown);

          const { error: upErr } = await ctx.supabase
            .from("leads")
            .update({
              lead_score: breakdown.total,
              lead_score_reason: reason,
            })
            .eq("id", lead.id);

          if (upErr) {
            await ctx.log(
              `Failed to score ${lead.company}: ${upErr.message}`,
              {
                action: "score_error",
                level: "error",
                target_table: "leads",
                target_id: lead.id,
              },
            );
            continue;
          }

          scored++;
          const name =
            `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() ||
            lead.company ||
            "Unknown";

          // Small artificial delay so the activity feed feels alive. This does
          // NOT touch the score — scoring stays fully deterministic.
          await new Promise((r) => setTimeout(r, 100 + Math.random() * 200));

          if (isPipelineReady(breakdown.total)) {
            qualified++;
            promotions.push({
              lead_id: lead.id,
              user_id: userId,
              qualification_reason: `Rule-based qualified: ${reason}`,
              pain_points: breakdown.notes.filter(
                (n) =>
                  n.includes("signal") ||
                  n.includes("NO WEBSITE") ||
                  n.includes("Manual"),
              ),
              status: "new",
            });

            await ctx.log(`✓ ${name} qualified at ${breakdown.total}/100`, {
              action: "lead_qualified",
              target_table: "leads",
              target_id: lead.id,
              level: "success",
              metadata: {
                score: breakdown.total,
                solution: lead.recommended_solution,
              },
            });
          } else {
            await ctx.log(
              `${name} scored ${breakdown.total}/100 (below threshold)`,
              {
                action: "lead_scored",
                target_table: "leads",
                target_id: lead.id,
                metadata: { score: breakdown.total },
              },
            );
          }
        }

        // Bulk upsert qualified_leads — re-runs update rather than duplicate.
        if (promotions.length > 0) {
          const { error: qErr } = await ctx.supabase
            .from("qualified_leads")
            .upsert(promotions, {
              onConflict: "lead_id",
              ignoreDuplicates: false,
            });
          if (qErr) {
            await ctx.log(`qualified_leads upsert error: ${qErr.message}`, {
              action: "promote_error",
              level: "error",
            });
          }
        }

        await ctx.log(`Qualified ${qualified}/${scored} leads at ≥70 score`, {
          action: "qualify_summary",
          level: "success",
          metadata: { scored, qualified },
        });

        return { scored, qualified };
      },
    );
  },
);
