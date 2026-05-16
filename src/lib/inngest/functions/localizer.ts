import { inngest, localizerEvent, outreachManagerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import {
  buildGujaratiMessage,
  buildHinglishMessage,
} from "@/lib/agents/personalizer-templates";
import type { Communication, Lead } from "@/types/database";

const MAX_MSGS_PER_RUN = 50;

type CommJoinRow = Communication & { leads: Lead | null };

export const localizerFn = inngest.createFunction(
  {
    id: "localizer",
    name: "Localizer",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: localizerEvent }],
  },
  async ({ event }) => {
    if (!event.data?.user_id) throw new Error("user_id required");
    const userId = event.data.user_id;

    return await runAgent(
      "localizer",
      userId,
      "Translate messages to Hinglish/Gujarati",
      async (ctx) => {
        const { data, error } = await ctx.supabase
          .from("communications")
          .select("*, leads(*)")
          .eq("user_id", userId)
          .eq("status", "queued")
          .eq("language", "english")
          .limit(MAX_MSGS_PER_RUN);

        if (error) throw new Error(`Fetch comms failed: ${error.message}`);

        const msgs = (data as CommJoinRow[] | null) ?? [];
        const needsLocalization = msgs.filter(
          (m) => m.metadata?.needs_localization === true,
        );

        if (needsLocalization.length === 0) {
          await ctx.log("No messages need localization", { action: "noop" });
        } else {
          await ctx.log(
            `Localizing ${needsLocalization.length} messages…`,
            { action: "localize_start" },
          );
        }

        const { data: settings } = await ctx.supabase
          .from("settings")
          .select("agency_name, sender_name")
          .eq("user_id", userId)
          .single();
        const agencyName = settings?.agency_name ?? "Webiox";
        const senderName = settings?.sender_name ?? "The team";

        let localizedCount = 0;

        for (const msg of needsLocalization) {
          const lead = msg.leads;
          if (!lead) continue;

          const targetLang =
            msg.metadata?.target_language === "gujarati"
              ? "gujarati"
              : "hinglish";
          const solution = lead.recommended_solution ?? "multi";

          const newBody =
            targetLang === "gujarati"
              ? buildGujaratiMessage(lead, agencyName, senderName, solution)
              : buildHinglishMessage(lead, agencyName, senderName, solution);

          await new Promise((r) => setTimeout(r, 150 + Math.random() * 250));

          const { error: upErr } = await ctx.supabase
            .from("communications")
            .update({
              content: newBody,
              language: targetLang,
              generated_by_agent: "localizer",
            })
            .eq("id", msg.id);

          if (upErr) {
            await ctx.log(
              `Failed to localize msg for ${lead.company}: ${upErr.message}`,
              {
                action: "localize_error",
                level: "error",
                target_table: "leads",
                target_id: lead.id,
              },
            );
            continue;
          }

          localizedCount++;
          await ctx.log(`✓ Translated ${lead.company} → ${targetLang}`, {
            action: "message_localized",
            target_table: "leads",
            target_id: lead.id,
            level: "success",
            metadata: { language: targetLang },
          });
        }

        // Chain to Outreach Manager — even messages that didn't need
        // localization (English b2b) still need to be sent.
        await ctx.log("Triggering Outreach Manager…", {
          action: "chain_outreach",
        });
        await inngest.send({
          name: outreachManagerEvent.name,
          data: { user_id: userId },
        });

        await ctx.log(
          `Localizer complete: ${localizedCount} translations`,
          {
            action: "localize_summary",
            level: "success",
            metadata: { localizedCount },
          },
        );
        return { localized: localizedCount };
      },
    );
  },
);
