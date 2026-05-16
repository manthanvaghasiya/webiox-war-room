"use server";

import { revalidatePath } from "next/cache";

import {
  dataEnricherEvent,
  followupSpecialistEvent,
  inngest,
  leadQualifierEvent,
  leadScoutEvent,
  personalizerEvent,
  replyReceivedEvent,
} from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";

export async function triggerLeadScout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await inngest.send({
    name: leadScoutEvent.name,
    data: { user_id: user.id, mode: "demo" },
  });

  return { ok: true as const };
}

export async function triggerDataEnricher() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await inngest.send({
    name: dataEnricherEvent.name,
    data: { user_id: user.id },
  });

  return { ok: true as const };
}

export async function triggerLeadQualifier() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await inngest.send({
    name: leadQualifierEvent.name,
    data: { user_id: user.id },
  });

  return { ok: true as const };
}

// Kicks off Personalizer, which auto-chains to Localizer then Outreach Manager.
export async function triggerPersonalizer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await inngest.send({
    name: personalizerEvent.name,
    data: { user_id: user.id },
  });

  return { ok: true as const };
}

// Fires the daily follow-up sweep on demand for the current user.
export async function triggerFollowupSpecialist() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await inngest.send({
    name: followupSpecialistEvent.name,
    data: { user_id: user.id },
  });

  return { ok: true as const };
}

// Synthetic-reply seeds per intent. Cover english / hinglish / gujarati so the
// reply pipeline (Objection Handler → Appointment Setter) can be demoed end to
// end without a real recipient.
const SIMULATED_REPLIES: Record<string, string[]> = {
  interested: [
    "Sounds interesting. When can we talk?",
    "Yes, I am open to a quick call this week.",
    "હા, વાત કરી શકાય. તમારો number share કરો.",
    "Hanji, baat karte hain. Tomorrow evening fine?",
  ],
  not_interested: [
    "Not interested, please remove me from your list.",
    "No thanks.",
    "Abhi nahi chahiye, baad mein dekhenge.",
  ],
  objection: [
    "Sounds good but pricing is a concern — we have a limited budget.",
    "We already work with another agency.",
    "Pricing kya rahegi? Budget tight hai.",
    "Already site banayi hui hai, kuch alag kya offer karoge?",
  ],
  question: [
    "How long does the website take to build?",
    "Do you provide post-launch support?",
    "Mobile app me kya features hote hain typically?",
    "કેટલા દિવસ માં website ready થઈ જાય?",
  ],
};

// Server action — NOT an agent. Injects a fake inbound reply against an
// outbound message so the reply pipeline can be exercised in demo mode.
export async function simulateInboundReply(opts: {
  comm_id: string;
  intent: "interested" | "not_interested" | "objection" | "question";
  custom_reply?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Mirror the outbound message's channel + language onto the reply.
  const { data: outbound } = await supabase
    .from("communications")
    .select("*, leads(first_name, last_name, company)")
    .eq("id", opts.comm_id)
    .eq("user_id", user.id)
    .single();

  if (!outbound) throw new Error("Original message not found");

  const pool = SIMULATED_REPLIES[opts.intent];
  const replyText =
    opts.custom_reply?.trim() ||
    pool[Math.floor(Math.random() * pool.length)];

  // Insert the inbound communication row.
  const { data: inbound, error } = await supabase
    .from("communications")
    .insert({
      user_id: user.id,
      lead_id: outbound.lead_id,
      channel: outbound.channel,
      direction: "inbound",
      status: "delivered",
      content: replyText,
      language: outbound.language,
      metadata: {
        classification: opts.intent,
        simulated: true,
        in_reply_to: opts.comm_id,
      },
    })
    .select()
    .single();

  if (error) throw new Error(`Insert reply failed: ${error.message}`);

  // Mark the original outbound as 'replied'.
  await supabase
    .from("communications")
    .update({ status: "replied", replied_at: new Date().toISOString() })
    .eq("id", opts.comm_id);

  // Move the lead to 'replied' and bump reply_count. Prefer an RPC if present,
  // otherwise fall back to a manual read-modify-write.
  await supabase
    .from("leads")
    .update({ status: "replied" })
    .eq("id", outbound.lead_id);

  const { error: rpcErr } = await supabase.rpc("increment_reply_count", {
    p_lead_id: outbound.lead_id,
  });
  if (rpcErr) {
    const { data: cur } = await supabase
      .from("leads")
      .select("reply_count")
      .eq("id", outbound.lead_id)
      .single();
    await supabase
      .from("leads")
      .update({ reply_count: (cur?.reply_count ?? 0) + 1 })
      .eq("id", outbound.lead_id);
  }

  // Hand off to the Objection Handler.
  await inngest.send({
    name: replyReceivedEvent.name,
    data: {
      user_id: user.id,
      lead_id: outbound.lead_id,
      comm_id: inbound.id,
      reply_text: replyText,
      reply_intent: opts.intent,
    },
  });

  revalidatePath("/comms");
  return { ok: true as const, reply_id: inbound.id, reply_text: replyText };
}

export async function saveSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const splitCsv = (val: FormDataEntryValue | null) =>
    String(val ?? "")
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);

  const payload = {
    agency_name: String(formData.get("agency_name") ?? "").trim() || "Webiox",
    sender_name: String(formData.get("sender_name") ?? "").trim() || null,
    sender_email: String(formData.get("sender_email") ?? "").trim() || null,
    daily_lead_limit: Math.max(
      0,
      Number(formData.get("daily_lead_limit") ?? 50) || 0,
    ),
    daily_email_limit: Math.max(
      0,
      Number(formData.get("daily_email_limit") ?? 100) || 0,
    ),
    icp_job_titles: splitCsv(formData.get("icp_job_titles")),
    icp_industries: splitCsv(formData.get("icp_industries")),
    icp_locations: splitCsv(formData.get("icp_locations")),
  };

  const { error } = await supabase
    .from("settings")
    .update(payload)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/settings");
  return { ok: true as const };
}
