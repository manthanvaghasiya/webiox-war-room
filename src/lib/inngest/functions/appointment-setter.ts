import { appointmentSetterEvent, inngest, outreachManagerEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";

export const appointmentSetterFn = inngest.createFunction(
  {
    id: "appointment-setter",
    name: "Appointment Setter",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: appointmentSetterEvent }],
  },
  async ({ event }) => {
    const { user_id, lead_id, comm_id } = event.data;

    return await runAgent(
      "appointment_setter",
      user_id,
      `Book call for lead ${lead_id}`,
      async (ctx) => {
        const { data: lead } = await ctx.supabase
          .from("leads")
          .select("*")
          .eq("id", lead_id)
          .single();
        if (!lead) throw new Error("Lead not found");

        const { data: settings } = await ctx.supabase
          .from("settings")
          .select("agency_name, calendly_url")
          .eq("user_id", user_id)
          .single();
        const agencyName = settings?.agency_name ?? "Webiox";
        const calendlyUrl =
          settings?.calendly_url ?? "https://calendly.com/webiox/discovery";

        // Mirror the inbound reply's channel + language.
        const { data: inbound } = await ctx.supabase
          .from("communications")
          .select("language, channel")
          .eq("id", comm_id)
          .single();
        const language = inbound?.language ?? "english";
        const channel = inbound?.channel ?? "email";

        const firstName = lead.first_name || "there";
        let body: string;
        if (language === "gujarati") {
          body = `${firstName} ભાઈ/બેન, બહુ સારું! Below link પર ઈચ્છિત time slot select કરો — 15 min discovery call book થઈ જશે.\n\n${calendlyUrl}\n\n— ${agencyName}`;
        } else if (language === "hinglish") {
          body = `${firstName} ji, awesome! Niche link par apna preferred time slot select karo — 15-min discovery call book ho jayegi.\n\n${calendlyUrl}\n\n— ${agencyName}`;
        } else {
          body = `Hi ${firstName}, fantastic! Please pick a time that works for you here — I've blocked 15-min discovery slots:\n\n${calendlyUrl}\n\n— ${agencyName}`;
        }

        // Queue the outbound calendar message.
        const { data: newMsg, error: msgErr } = await ctx.supabase
          .from("communications")
          .insert({
            user_id,
            lead_id,
            channel,
            direction: "outbound",
            status: "queued",
            content: body,
            language,
            generated_by_agent: "appointment_setter",
            metadata: { reply_to: comm_id, calendly_link_sent: true },
          })
          .select()
          .single();

        if (msgErr)
          throw new Error(`Queue calendar msg failed: ${msgErr.message}`);

        await ctx.supabase
          .from("qualified_leads")
          .update({ calendly_link_sent: true })
          .eq("lead_id", lead_id);

        // Demo placeholder: a real Calendly webhook would create this. Book
        // it 2 days out at 11am IST (= 5:30 UTC).
        const scheduled = new Date();
        scheduled.setDate(scheduled.getDate() + 2);
        scheduled.setUTCHours(5, 30, 0, 0);

        const { error: callErr } = await ctx.supabase.from("calls").insert({
          user_id,
          lead_id,
          scheduled_at: scheduled.toISOString(),
          duration_minutes: 15,
          meeting_url: calendlyUrl,
          status: "booked",
        });
        if (callErr) {
          await ctx.log(`Call insert warning: ${callErr.message}`, {
            action: "call_insert_warning",
            level: "warning",
            target_table: "leads",
            target_id: lead_id,
          });
        }

        await ctx.supabase
          .from("qualified_leads")
          .update({ status: "call_booked" })
          .eq("lead_id", lead_id);

        await ctx.log(
          `📅 Calendar link sent to ${lead.company} (${language}, ${channel})`,
          {
            action: "calendar_sent",
            target_table: "leads",
            target_id: lead_id,
            level: "success",
            metadata: { language, channel, comm_id: newMsg.id },
          },
        );

        // Chain to Outreach Manager to flip the queued message → sent.
        await inngest.send({
          name: outreachManagerEvent.name,
          data: { user_id },
        });

        return { booked: true, comm_id: newMsg.id };
      },
    );
  },
);
