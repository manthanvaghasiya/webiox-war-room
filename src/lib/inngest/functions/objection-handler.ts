import {
  appointmentSetterEvent,
  inngest,
  outreachManagerEvent,
  replyReceivedEvent,
} from "../client";
import { runAgent } from "@/lib/agents/runner";

type Classification =
  | "interested"
  | "not_interested"
  | "objection"
  | "question"
  | "out_of_office";

// Classify a reply. When a simulated intent hint is present we trust it;
// otherwise fall back to keyword detection so real replies work later.
function classifyReply(text: string, hintedIntent?: string): Classification {
  if (
    hintedIntent &&
    ["interested", "not_interested", "objection", "question"].includes(
      hintedIntent,
    )
  ) {
    return hintedIntent as Classification;
  }
  const t = text.toLowerCase();
  if (/(out of office|on vacation|away from)/.test(t)) return "out_of_office";
  if (/(not interested|remove me|unsubscribe|no thanks|abhi nahi)/.test(t))
    return "not_interested";
  if (/(price|budget|cost|kya rahegi|kitna|expensive)/.test(t))
    return "objection";
  if (/(\?|how long|do you|can you|kya|kitna|kab|કેટલા|શું)/.test(t))
    return "question";
  if (/(yes|interested|sounds good|haan|હા|baat karte)/.test(t))
    return "interested";
  return "question";
}

// Short, conversational template counters. Each supports english / hinglish /
// gujarati. `interested` returns "" — the Appointment Setter takes over there.
function generateCounter(
  lead: { first_name: string | null },
  classification: string,
  language: string,
  agency: string,
): string {
  const firstName = lead.first_name || "there";

  if (classification === "objection") {
    if (language === "gujarati") {
      return `${firstName} ભાઈ/બેન, સમજાય છે. Budget concern સામાન્ય છે — એટલે અમે flexible packages રાખીએ છીએ, starter થી enterprise સુધી. 15-min call પર exact need સમજીને price quote કરી શકું. ક્યારે free છો?\n\n— ${agency}`;
    }
    if (language === "hinglish") {
      return `${firstName} ji, samajh sakta hoon. Budget concern normal hai — isliye humare paas flexible packages hain starter se enterprise tak. 15-min call par exact need samajh ke price quote kar sakta hoon. Kab free ho?\n\n— ${agency}`;
    }
    return `Hi ${firstName}, totally understand. Budget is always a real conversation — that's why we offer flexible packages from starter to enterprise. A 15-min call would let me understand exact scope and give you an accurate quote. When works for you?\n\n— ${agency}`;
  }

  if (classification === "question") {
    if (language === "gujarati") {
      return `${firstName} ભાઈ/બેન, સારો question. એમ તો details thoda lambo જવાબ માગે છે — 10-min call પર બધું clearly explain કરી શકું. Calendly link મોકલું?\n\n— ${agency}`;
    }
    if (language === "hinglish") {
      return `${firstName} ji, achha question. Sahi se explain karne ke liye 10-min call best rahega. Calendly link bhej doon?\n\n— ${agency}`;
    }
    return `Great question, ${firstName}. The honest answer needs a bit of context, so a 10-min call would let me explain properly. Should I send a Calendly link?\n\n— ${agency}`;
  }

  if (classification === "not_interested") {
    if (language === "gujarati")
      return `સમજાય ગયું, ${firstName} ભાઈ/બેન. Thanks for the response. Future માં જરૂર પડે તો યાદ રાખશો. — ${agency}`;
    if (language === "hinglish")
      return `Theek hai ${firstName} ji, samjh gaya. Future me zarurat ho to bata dijiyega. — ${agency}`;
    return `Got it ${firstName}, appreciate the quick reply. I'll close the file — feel free to reach out anytime. — ${agency}`;
  }

  // interested → no counter; Appointment Setter handles it.
  return "";
}

export const objectionHandlerFn = inngest.createFunction(
  {
    id: "objection-handler",
    name: "Objection Handler",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ event: replyReceivedEvent }],
  },
  async ({ event }) => {
    const { user_id, lead_id, comm_id, reply_text, reply_intent } = event.data;

    return await runAgent(
      "objection_handler",
      user_id,
      `Classify reply from lead ${lead_id}`,
      async (ctx) => {
        const { data: lead } = await ctx.supabase
          .from("leads")
          .select("*")
          .eq("id", lead_id)
          .single();
        if (!lead) throw new Error("Lead not found");

        const { data: inboundComm } = await ctx.supabase
          .from("communications")
          .select("*")
          .eq("id", comm_id)
          .single();
        const language = inboundComm?.language ?? "english";

        const classification = classifyReply(reply_text, reply_intent);

        await ctx.log(
          `Reply from ${lead.company} classified as: ${classification.toUpperCase()}`,
          {
            action: "reply_classified",
            target_table: "leads",
            target_id: lead_id,
            level: classification === "interested" ? "success" : "info",
            metadata: {
              classification,
              reply_text: reply_text.slice(0, 100),
            },
          },
        );

        // Persist the classification on the inbound comm's metadata.
        await ctx.supabase
          .from("communications")
          .update({
            metadata: { ...(inboundComm?.metadata || {}), classification },
          })
          .eq("id", comm_id);

        const { data: settings } = await ctx.supabase
          .from("settings")
          .select("agency_name")
          .eq("user_id", user_id)
          .single();
        const agencyName = settings?.agency_name ?? "Webiox";
        const channel = inboundComm?.channel ?? "email";

        if (classification === "interested") {
          await ctx.log(`Routing ${lead.company} → Appointment Setter`, {
            action: "route_to_appointment",
            target_table: "leads",
            target_id: lead_id,
          });
          await inngest.send({
            name: appointmentSetterEvent.name,
            data: { user_id, lead_id, comm_id },
          });
        } else if (classification === "not_interested") {
          await ctx.supabase
            .from("leads")
            .update({ status: "not_interested" })
            .eq("id", lead_id);

          const ack = generateCounter(
            lead,
            "not_interested",
            language,
            agencyName,
          );
          await ctx.supabase.from("communications").insert({
            user_id,
            lead_id,
            channel,
            direction: "outbound",
            status: "queued",
            content: ack,
            language,
            generated_by_agent: "objection_handler",
            metadata: {
              reply_to: comm_id,
              classification_response: classification,
            },
          });
          await ctx.log(`Marked ${lead.company} as not_interested`, {
            action: "mark_not_interested",
            target_table: "leads",
            target_id: lead_id,
          });
        } else if (
          classification === "objection" ||
          classification === "question"
        ) {
          const counter = generateCounter(
            lead,
            classification,
            language,
            agencyName,
          );
          await ctx.supabase.from("communications").insert({
            user_id,
            lead_id,
            channel,
            direction: "outbound",
            status: "queued",
            content: counter,
            language,
            generated_by_agent: "objection_handler",
            metadata: {
              reply_to: comm_id,
              classification_response: classification,
            },
          });
          await ctx.log(
            `Drafted ${classification} counter for ${lead.company}`,
            {
              action: "counter_drafted",
              target_table: "leads",
              target_id: lead_id,
              level: "success",
              metadata: { classification },
            },
          );
          // Chain to Outreach Manager to flip the queued counter → sent.
          await inngest.send({
            name: outreachManagerEvent.name,
            data: { user_id },
          });
        } else {
          await ctx.log(`No action needed for ${classification}`, {
            action: "no_action",
            target_table: "leads",
            target_id: lead_id,
          });
        }

        return { classification };
      },
    );
  },
);
