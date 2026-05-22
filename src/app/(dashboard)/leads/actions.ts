"use server";

import { revalidatePath } from "next/cache";
import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";
import type { CallOutcome, Lead, LeadStatus } from "@/types/database";

type DecidableOutcome = Exclude<CallOutcome, "pending_call">;

// Maps a call outcome to the lead's pipeline status. Confirmed → qualified so
// the lead also surfaces on /qualified; rejected → not_interested; a pending
// follow-up keeps the lead "contacted".
const STATUS_MAPPING: Record<DecidableOutcome, LeadStatus> = {
  confirmed: "qualified",
  rejected: "not_interested",
  follow_up: "contacted",
};

// Initial deal value (INR) seeded by recommended solution. Custom software is
// the highest-ticket build, automation mid, everything else (website/multi) the
// entry point.
function initialDealValue(solution: Lead["recommended_solution"]): number {
  if (solution === "crm") return 100_000; // custom_software maps to crm in DB
  if (solution === "automation") return 50_000;
  return 25_000;
}

export async function updateLeadOutcome(
  leadId: string,
  outcome: DecidableOutcome,
  notes: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Fetch full lead context for the follow-up generation + deal seeding.
  const { data: leadData } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("user_id", user.id)
    .single();

  const lead = leadData as Lead | null;
  if (!lead) throw new Error("Lead not found");

  // AI follow-up message — always resolves to something (template fallback).
  const followUpDraft = await generateFollowUp({ lead, outcome, notes });

  const { error } = await supabase
    .from("leads")
    .update({
      call_outcome: outcome,
      call_notes: notes,
      follow_up_draft: followUpDraft,
      call_decided_at: new Date().toISOString(),
      status: STATUS_MAPPING[outcome],
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId)
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to save: ${error.message}`);

  // Confirmed leads auto-create a deal in the 'proposal' stage — but never
  // duplicate if the user clicks Confirmed twice. We dedupe on (user, lead).
  let dealCreated = false;
  if (outcome === "confirmed") {
    const { data: existingDeal } = await supabase
      .from("deals")
      .select("id")
      .eq("user_id", user.id)
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!existingDeal) {
      const contactName =
        [lead.first_name, lead.last_name].filter(Boolean).join(" ").trim() ||
        null;

      const { error: dealError } = await supabase.from("deals").insert({
        user_id: user.id,
        lead_id: leadId,
        company: lead.company ?? "Unknown",
        contact_name: contactName,
        deal_value: initialDealValue(lead.recommended_solution),
        stage: "proposal",
        notes: `Confirmed from /leads call outcome. Notes: ${notes}`,
      });
      if (!dealError) dealCreated = true;
    }
  }

  await supabase.from("agent_logs").insert({
    user_id: user.id,
    agent: "crm_analyst",
    action: "call_outcome",
    level: "success",
    message: `${outcome.toUpperCase()}: ${lead.company ?? "lead"} — ${notes.slice(0, 60)}`,
    metadata: { lead_id: leadId, outcome, deal_created: dealCreated },
  });

  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/deals");

  return { ok: true as const, follow_up_draft: followUpDraft, dealCreated };
}

async function generateFollowUp(opts: {
  lead: Lead;
  outcome: DecidableOutcome;
  notes: string;
}): Promise<string> {
  const { lead, outcome, notes } = opts;
  const fallback = templateFallback(lead, outcome, notes);

  if (!process.env.ANTHROPIC_API_KEY) return fallback;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const outcomeBrief =
      outcome === "confirmed"
        ? `CONFIRMED — they agreed to move forward.
Write a warm follow-up that:
- Thanks them for the call
- Confirms what we discussed (use my notes)
- Says I'll send a tailored proposal in 24 hours
- Asks them to share any specific requirements via WhatsApp reply
- Mentions sadgurucarsurat.com link for reference`
        : outcome === "rejected"
          ? `REJECTED — they said no.
Write a polite close-the-loop message that:
- Thanks them for their time
- Acknowledges their reason (use my notes briefly)
- Leaves the door open ("if needs change in future")
- Keeps it short — max 3 sentences
- No begging, no aggression`
          : `PENDING / FOLLOW UP — they showed interest but no commitment.
Write a day-3 follow-up that:
- References our call casually
- Mentions ONE specific value point relevant to them
- Includes the sadgurucarsurat.com link as proof
- Asks ONE simple question to re-engage them
- Max 4 sentences
- Sounds human, not pushy`;

    const langRule =
      lead.preferred_language === "gujarati"
        ? "GUJARATI (Devanagari script)"
        : "HINGLISH (Roman script, mix Hindi-English)";

    const prompt = `Write a follow-up message to copy-paste into WhatsApp.

Context:
- Lead: ${lead.company ?? "business"} in ${lead.location ?? "India"}
- Vertical: ${lead.industry || "business"}
- Rating: ${lead.google_rating ?? 0}★ from ${lead.review_count ?? 0} reviews
- Has website: ${lead.website ? "Yes (" + lead.website + ")" : "NO"}
- Recommended solution: ${lead.recommended_solution || "multi"}
- Preferred language: ${lead.preferred_language || "hinglish"}
- Call outcome: ${outcome.toUpperCase()}
- My call notes: "${notes}"

I'm Manthan from Webiox, Ahmedabad. My case study: sadgurucarsurat.com.

Write the message based on outcome:
${outcomeBrief}

LANGUAGE RULES:
- Write in ${langRule}
- Sound like a real person, not corporate
- No "We at Webiox revolutionize..." style fluff
- Sign off: "— Manthan, Webiox"

Output ONLY the message text, nothing else. No preamble, no explanation.`;

    const resp = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const block = resp.content?.[0];
    const text = block && block.type === "text" ? block.text.trim() : "";
    return text && text.length > 20 ? text : fallback;
  } catch {
    return fallback;
  }
}

function templateFallback(
  lead: Lead,
  outcome: DecidableOutcome,
  notes: string,
): string {
  const name = lead.company ?? "aapke business";
  const caseStudy = "sadgurucarsurat.com";

  if (outcome === "confirmed") {
    return `Namaste,\n\nAaj ki call ke liye thanks. Aapne jo discuss kiya (${notes.slice(0, 80)}...) — main 24 hours mein tailored proposal bhej dunga.\n\nReference ke liye: ${caseStudy}\n\nKuch specific requirements ho to WhatsApp pe reply kar dena.\n\n— Manthan, Webiox`;
  }

  if (outcome === "rejected") {
    return `Namaste,\n\nAapke time ke liye thanks. Samajh aaya. Future mein agar requirement aaye to bata dena.\n\n— Manthan, Webiox`;
  }

  return `Namaste,\n\nAaj baat hui thi ${name} ke liye. Yeh ek example: ${caseStudy} — same approach aap ke liye bhi achha rahega.\n\nKya 10 minute baat kar sakte hain?\n\n— Manthan, Webiox`;
}
