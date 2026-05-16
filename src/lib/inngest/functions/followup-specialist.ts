import { followupSpecialistEvent, inngest, outreachManagerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";

export const followupSpecialistFn = inngest.createFunction(
  {
    id: "followup-specialist",
    name: "Follow-up Specialist",
    retries: 1,
    concurrency: { limit: 1 },
    triggers: [
      { event: followupSpecialistEvent },
      { cron: "0 4 * * *" }, // 9:30am IST daily = 4:00 UTC
    ],
  },
  async ({ event, step }) => {
    // Resolve target users: a single user from the event, or every user when
    // triggered by cron.
    const eventUserId = (event.data as { user_id?: string } | undefined)
      ?.user_id;

    const userIds: string[] = await step.run("resolve-users", async () => {
      if (eventUserId) return [eventUserId];
      const { createClient } = await import("@supabase/supabase-js");
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data } = await sb.from("settings").select("user_id");
      return data?.map((r) => r.user_id as string) ?? [];
    });

    const results: { userId: string; queued: number }[] = [];

    for (const userId of userIds) {
      const result = await step.run(`followup-for-${userId}`, async () => {
        return await runAgent(
          "followup_specialist",
          userId,
          "Send 3/7/14 day follow-ups",
          async (ctx) => {
            const { data: settings } = await ctx.supabase
              .from("settings")
              .select("agency_name")
              .eq("user_id", userId)
              .single();
            const agencyName = settings?.agency_name ?? "Webiox";

            const now = new Date();
            let totalQueued = 0;

            for (const days of [3, 7, 14] as const) {
              // Window = the calendar day exactly N days ago.
              const dayStart = new Date(now);
              dayStart.setDate(dayStart.getDate() - days);
              dayStart.setHours(0, 0, 0, 0);
              const dayEnd = new Date(dayStart);
              dayEnd.setHours(23, 59, 59, 999);

              // Outbound messages sent that day with no reply yet.
              const { data: comms } = await ctx.supabase
                .from("communications")
                .select(
                  "id, lead_id, language, channel, leads(first_name, company, status)",
                )
                .eq("user_id", userId)
                .eq("direction", "outbound")
                .eq("status", "sent")
                .gte("sent_at", dayStart.toISOString())
                .lte("sent_at", dayEnd.toISOString())
                .limit(50);

              for (const comm of comms ?? []) {
                // Untyped client infers the embed as an array; runtime returns
                // a single object for this to-one FK.
                const lead = comm.leads as unknown as {
                  first_name: string | null;
                  company: string | null;
                  status: string;
                } | null;
                if (!lead) continue;
                if (
                  ["not_interested", "cold", "invalid"].includes(lead.status)
                )
                  continue;
                if (lead.status === "replied") continue;

                // Skip if a follow-up at this interval already exists.
                const { data: existingFollowup } = await ctx.supabase
                  .from("communications")
                  .select("id")
                  .eq("lead_id", comm.lead_id)
                  .eq("direction", "outbound")
                  .contains("metadata", { followup_day: days })
                  .limit(1);

                if (existingFollowup && existingFollowup.length > 0) continue;

                const firstName = lead.first_name || "there";
                const lang = comm.language || "english";
                let body: string;

                if (days === 3) {
                  if (lang === "gujarati")
                    body = `${firstName} ભાઈ/બેન, ગયા week message moklyo હતો — બસ confirm કરવા માગતો હતો કે જરૂરી લાગે છે. એક quick call?\n\n— ${agencyName}`;
                  else if (lang === "hinglish")
                    body = `${firstName} ji, last week message bheja tha — bas confirm karna chahta tha ki interest hai ya nahi. Ek quick call?\n\n— ${agencyName}`;
                  else
                    body = `Hi ${firstName}, just bumping this up in case you missed it. Worth a quick 10-min chat?\n\n— ${agencyName}`;
                } else if (days === 7) {
                  if (lang === "gujarati")
                    body = `${firstName} ભાઈ/બેન, last week message અંગે — તમે busy હશો. એક new idea હતો જે માટે તમારા જેવા businesses ને fit લાગે છે. Worth ek call?\n\n— ${agencyName}`;
                  else if (lang === "hinglish")
                    body = `${firstName} ji, ek week ho gaya — pata hai busy hote ho. Ek naya idea hai jo aapke jaise business ke liye fit lagta hai. Ek baar baat karein?\n\n— ${agencyName}`;
                  else
                    body = `Hi ${firstName}, following up — I know inboxes get busy. We just shipped something for a similar ${lead.company?.slice(0, 8) || "business"} that might be relevant. Worth a brief look?\n\n— ${agencyName}`;
                } else {
                  if (lang === "gujarati")
                    body = `${firstName} ભાઈ/બેન, last message — wanted to check final time. If timing isn't right, no worries — હું file close કરી દઈશ. Reply કરો માત્ર "later" if you want me to follow up again માં 3 months.\n\n— ${agencyName}`;
                  else if (lang === "hinglish")
                    body = `${firstName} ji, ye mera last message — agar timing thik nahi hai to "later" reply kar dijiye, main 3 mahine baad firse contact karunga. Otherwise file close kar dunga.\n\n— ${agencyName}`;
                  else
                    body = `Hi ${firstName}, last note from me — if the timing isn't right, just reply "later" and I'll circle back in 3 months. Otherwise I'll close the file. Either way, thanks.\n\n— ${agencyName}`;
                }

                const { error: insErr } = await ctx.supabase
                  .from("communications")
                  .insert({
                    user_id: userId,
                    lead_id: comm.lead_id,
                    channel: comm.channel,
                    direction: "outbound",
                    status: "queued",
                    content: body,
                    language: lang,
                    generated_by_agent: "followup_specialist",
                    metadata: { followup_day: days, original_comm: comm.id },
                  });

                if (!insErr) {
                  totalQueued++;
                  await ctx.log(
                    `Day-${days} follow-up queued for ${lead.company}`,
                    {
                      action: "followup_queued",
                      target_table: "leads",
                      target_id: comm.lead_id,
                      level: "success",
                      metadata: { day: days, language: lang },
                    },
                  );
                }

                // Day-14 with no reply ever → mark the lead cold.
                if (days === 14) {
                  await ctx.supabase
                    .from("leads")
                    .update({ status: "cold" })
                    .eq("id", comm.lead_id);
                }
              }
            }

            if (totalQueued > 0) {
              await inngest.send({
                name: outreachManagerEvent.name,
                data: { user_id: userId },
              });
            }

            await ctx.log(
              `Follow-up specialist: ${totalQueued} follow-ups queued`,
              {
                action: "followup_summary",
                level: "success",
                metadata: { totalQueued },
              },
            );
            return { queued: totalQueued };
          },
        );
      });
      results.push({ userId, queued: result.queued });
    }

    return { runs: results };
  },
);
