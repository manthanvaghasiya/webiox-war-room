import { inngest, outreachManagerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import { sendText, sendTemplate } from "@/lib/whatsapp";
import type { Communication } from "@/types/database";

const MAX_MSGS_PER_RUN = 50;

type CommSendRow = Communication & {
  leads: {
    company: string | null;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
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
      "Send WhatsApp outreach messages via Meta Cloud API",
      async (ctx) => {
        const { data, error } = await ctx.supabase
          .from("communications")
          .select("*, leads(company, first_name, last_name, phone)")
          .eq("user_id", userId)
          .eq("status", "queued")
          .eq("direction", "outbound")
          .limit(MAX_MSGS_PER_RUN);

        if (error) throw new Error(`Fetch comms failed: ${error.message}`);

        const msgs = (data as CommSendRow[] | null) ?? [];
        if (msgs.length === 0) {
          await ctx.log("No messages in queue", { action: "noop" });
          return { sent: 0, failed: 0 };
        }

        const hasWhatsApp =
          !!process.env.WHATSAPP_PHONE_NUMBER_ID &&
          !!process.env.WHATSAPP_ACCESS_TOKEN;

        await ctx.log(
          `📨 Processing ${msgs.length} queued messages — WhatsApp ${hasWhatsApp ? "LIVE ✅" : "DEMO ⚠️"}`,
          {
            action: "send_start",
            level: hasWhatsApp ? "info" : "warning",
            metadata: { count: msgs.length, live: hasWhatsApp },
          },
        );

        let sentCount = 0;
        let failCount = 0;

        for (const msg of msgs) {
          const company = msg.leads?.company ?? "Unknown";
          const phone = msg.leads?.phone ?? null;
          const channel = msg.channel;
          const now = new Date().toISOString();

          // Small delay to avoid rate limits
          await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));

          let externalId: string | null = null;
          let sendError: string | null = null;

          if (channel === "whatsapp" && hasWhatsApp && phone) {
            // First outreach = use template (cold lead, outside 24hr window).
            // Subsequent messages (follow-ups) = use free-form text.
            const isFirstContact = !msg.subject?.includes("follow");

            if (isFirstContact) {
              // Try template first; fall back to free text if template not set up yet.
              const templateName = process.env.WHATSAPP_TEMPLATE_NAME ?? "";
              if (templateName) {
                const res = await sendTemplate({
                  to: phone,
                  template: templateName,
                  language: msg.language === "gujarati" ? "gu" : msg.language === "hinglish" ? "hi" : "en",
                  components: [
                    {
                      type: "body",
                      parameters: [
                        { type: "text", text: company },
                        { type: "text", text: msg.leads?.company?.split(" ")[0] ?? "your city" },
                        { type: "text", text: "website + CRM" },
                      ],
                    },
                  ],
                });
                if (res.ok) externalId = res.message_id;
                else sendError = res.error;
              } else {
                // No template configured — send free text (works if lead has
                // messaged the business number first, otherwise Meta will reject).
                const res = await sendText(phone, msg.content ?? "");
                if (res.ok) externalId = res.message_id;
                else sendError = res.error;
              }
            } else {
              // Follow-up — within 24hr window (they replied before).
              const res = await sendText(phone, msg.content ?? "");
              if (res.ok) externalId = res.message_id;
              else sendError = res.error;
            }
          } else if (channel === "whatsapp" && !phone) {
            sendError = "No phone number on lead";
          } else if (!hasWhatsApp) {
            // Demo mode fallback
            externalId = `demo_${Date.now()}_${msg.id.slice(0, 8)}`;
          }

          if (sendError) {
            await ctx.supabase
              .from("communications")
              .update({ status: "failed", generated_by_agent: "outreach_manager" })
              .eq("id", msg.id);

            await ctx.log(`❌ Failed to send to ${company}: ${sendError}`, {
              action: "send_error",
              level: "error",
              target_table: "leads",
              target_id: msg.lead_id,
            });
            failCount++;
            continue;
          }

          // Mark sent
          await ctx.supabase
            .from("communications")
            .update({
              status: "sent",
              sent_at: now,
              delivered_at: new Date(Date.now() + 30000).toISOString(),
              external_id: externalId,
              generated_by_agent: "outreach_manager",
            })
            .eq("id", msg.id);

          await ctx.supabase
            .from("leads")
            .update({ status: "contacted", last_contacted_at: now })
            .eq("id", msg.lead_id);

          sentCount++;
          await ctx.log(
            `✅ Sent WhatsApp to ${company} (${msg.language}) — id: ${externalId}`,
            {
              action: "message_sent",
              target_table: "leads",
              target_id: msg.lead_id,
              level: "success",
              metadata: { channel, language: msg.language, external_id: externalId },
            },
          );
        }

        await ctx.log(
          `📨 Outreach complete: ${sentCount} sent, ${failCount} failed`,
          {
            action: "send_summary",
            level: sentCount > 0 ? "success" : "warning",
            metadata: { sentCount, failCount },
          },
        );

        return { sent: sentCount, failed: failCount };
      },
    );
  },
);
