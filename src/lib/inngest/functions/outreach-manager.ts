import { inngest, outreachManagerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import type { Communication } from "@/types/database";

const MAX_MSGS_PER_RUN = 50;

type CommSendRow = Communication & {
  leads: {
    company: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export const outreachManagerFn = inngest.createFunction(
  {
    id: "outreach-manager",
    name: "Outreach Manager",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: outreachManagerEvent }],
  },
  async ({ event }) => {
    if (!event.data?.user_id) throw new Error("user_id required");
    const userId = event.data.user_id;

    return await runAgent(
      "outreach_manager",
      userId,
      "Send outreach messages (DEMO MODE — no real sends)",
      async (ctx) => {
        const { data, error } = await ctx.supabase
          .from("communications")
          .select("*, leads(company, first_name, last_name)")
          .eq("user_id", userId)
          .eq("status", "queued")
          .eq("direction", "outbound")
          .limit(MAX_MSGS_PER_RUN);

        if (error) throw new Error(`Fetch comms failed: ${error.message}`);

        const msgs = (data as CommSendRow[] | null) ?? [];
        if (msgs.length === 0) {
          await ctx.log("No messages in queue", { action: "noop" });
          return { sent: 0 };
        }

        await ctx.log(
          `📨 DEMO MODE — Processing ${msgs.length} queued messages (no real sends)`,
          {
            action: "send_start",
            level: "warning",
            metadata: { count: msgs.length, demo: true },
          },
        );

        let sentCount = 0;

        for (const msg of msgs) {
          const company = msg.leads?.company ?? "Unknown";
          const channel = msg.channel;

          await new Promise((r) => setTimeout(r, 250 + Math.random() * 350));

          // DEMO MODE: flip queued → sent with simulated timestamps.
          const now = new Date().toISOString();
          const { error: upErr } = await ctx.supabase
            .from("communications")
            .update({
              status: "sent",
              sent_at: now,
              delivered_at: new Date(Date.now() + 30000).toISOString(),
              external_id: `demo_${Date.now()}_${msg.id.slice(0, 8)}`,
              generated_by_agent: "outreach_manager",
            })
            .eq("id", msg.id);

          if (upErr) {
            await ctx.log(
              `Failed to mark sent ${company}: ${upErr.message}`,
              {
                action: "send_error",
                level: "error",
                target_table: "leads",
                target_id: msg.lead_id,
              },
            );
            continue;
          }

          sentCount++;
          await ctx.log(
            `✓ [DEMO] Sent ${channel.toUpperCase()} to ${company} (${msg.language})`,
            {
              action: "message_sent",
              target_table: "leads",
              target_id: msg.lead_id,
              level: "success",
              metadata: {
                channel,
                language: msg.language,
                demo: true,
                comm_id: msg.id,
              },
            },
          );

          // Move the underlying lead forward. qualified_leads.status is left
          // untouched until a dedicated 'contacted' status exists.
          await ctx.supabase
            .from("leads")
            .update({ status: "contacted", last_contacted_at: now })
            .eq("id", msg.lead_id);
        }

        await ctx.log(
          `📨 Outreach complete: ${sentCount} messages "sent" (DEMO — nothing actually delivered)`,
          {
            action: "send_summary",
            level: "success",
            metadata: { sentCount, demo: true },
          },
        );

        return { sent: sentCount, demo: true };
      },
    );
  },
);
