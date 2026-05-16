import { inngest, localizerEvent, personalizerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import { buildPersonalizedMessage } from "@/lib/agents/personalizer-templates";
import { detectLanguageForLead } from "@/lib/agents/localizer-helpers";
import type { Lead } from "@/types/database";

const MAX_LEADS_PER_RUN = 50;

type QualifiedJoinRow = {
  id: string;
  status: string;
  leads: Lead | null;
};

export const personalizerFn = inngest.createFunction(
  {
    id: "personalizer",
    name: "Personalizer",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: personalizerEvent }],
  },
  async ({ event }) => {
    if (!event.data?.user_id) throw new Error("user_id required");
    const userId = event.data.user_id;

    return await runAgent(
      "personalizer",
      userId,
      "Personalize messages for qualified leads",
      async (ctx) => {
        const { data: settings } = await ctx.supabase
          .from("settings")
          .select("agency_name, sender_name")
          .eq("user_id", userId)
          .single();
        const agencyName = settings?.agency_name ?? "Webiox";
        const senderName = settings?.sender_name ?? "The team";

        // Qualified leads not yet messaged.
        const { data, error } = await ctx.supabase
          .from("qualified_leads")
          .select("*, leads(*)")
          .eq("user_id", userId)
          .eq("status", "new")
          .limit(MAX_LEADS_PER_RUN);

        if (error)
          throw new Error(`Fetch qualified leads failed: ${error.message}`);

        const qualifiedRows = (data as QualifiedJoinRow[] | null) ?? [];
        if (qualifiedRows.length === 0) {
          await ctx.log("No qualified leads to personalize", {
            action: "noop",
            level: "info",
          });
          return { personalized: 0 };
        }

        await ctx.log(
          `Personalizing ${qualifiedRows.length} qualified leads…`,
          {
            action: "personalize_start",
            metadata: { count: qualifiedRows.length },
          },
        );

        let personalizedCount = 0;

        for (const q of qualifiedRows) {
          const lead = q.leads;
          if (!lead) continue;

          // Skip if this lead already has an outbound message in flight/sent.
          const { data: existingMsg } = await ctx.supabase
            .from("communications")
            .select("id")
            .eq("lead_id", lead.id)
            .eq("direction", "outbound")
            .in("status", [
              "queued",
              "sending",
              "sent",
              "delivered",
              "read",
              "replied",
            ])
            .limit(1);

          if (existingMsg && existingMsg.length > 0) {
            await ctx.log(
              `Skipped ${lead.company} — already has outbound message`,
              {
                action: "skip_existing",
                target_table: "leads",
                target_id: lead.id,
              },
            );
            continue;
          }

          const { subject, body } = buildPersonalizedMessage(
            lead,
            agencyName,
            senderName,
          );

          const language = detectLanguageForLead(lead);
          const channel =
            lead.preferred_channel ??
            (lead.segment === "b2b_global" ? "email" : "whatsapp");
          const commChannel = channel === "email" ? "email" : "whatsapp";

          await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));

          // Inserted in English; Localizer translates the local-India ones.
          const { error: insErr } = await ctx.supabase
            .from("communications")
            .insert({
              user_id: userId,
              lead_id: lead.id,
              channel: commChannel,
              direction: "outbound",
              status: "queued",
              subject: commChannel === "email" ? subject : null,
              content: body,
              language: "english",
              generated_by_agent: "personalizer",
              metadata: {
                needs_localization: language !== "english",
                target_language: language,
              },
            });

          if (insErr) {
            await ctx.log(
              `Failed to queue msg for ${lead.company}: ${insErr.message}`,
              {
                action: "queue_error",
                level: "error",
                target_table: "leads",
                target_id: lead.id,
              },
            );
            continue;
          }

          personalizedCount++;
          await ctx.log(
            `✓ Personalized: ${lead.company} (${commChannel}, ${language})`,
            {
              action: "message_personalized",
              target_table: "leads",
              target_id: lead.id,
              level: "success",
              metadata: { channel: commChannel, target_language: language },
            },
          );
        }

        // Chain forward to the Localizer.
        if (personalizedCount > 0) {
          await ctx.log("Triggering Localizer for translation…", {
            action: "chain_localizer",
          });
          await inngest.send({
            name: localizerEvent.name,
            data: { user_id: userId },
          });
        }

        await ctx.log(
          `Personalizer complete: ${personalizedCount} messages queued`,
          {
            action: "personalize_summary",
            level: "success",
            metadata: { personalizedCount },
          },
        );
        return { personalized: personalizedCount };
      },
    );
  },
);
