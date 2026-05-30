// Meta WhatsApp Cloud API Webhook
//
// Setup in Meta Developer Console:
//   1. App → WhatsApp → Configuration → Webhook
//   2. Callback URL: https://yourdomain.com/api/whatsapp/webhook
//   3. Verify Token: same string as WHATSAPP_VERIFY_TOKEN in .env.local
//   4. Subscribe to: messages
//
// This webhook:
//   GET  → Meta verification (hub.challenge handshake)
//   POST → Inbound message → fires inngest replyReceivedEvent → lead qualifier

import { type NextRequest, NextResponse } from "next/server";
import { inngest } from "@/lib/inngest/client";
import { replyReceivedEvent } from "@/lib/inngest/client";
import { createClient } from "@supabase/supabase-js";

// ── GET — Meta webhook verification ─────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    console.log("✅ WhatsApp webhook verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// ── POST — Inbound WhatsApp message ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  let body: WhatsAppWebhookBody;
  try {
    body = (await req.json()) as WhatsAppWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only process whatsapp messages
  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ status: "ignored" });
  }

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value?.messages) continue;

      for (const msg of value.messages) {
        if (msg.type !== "text") continue;

        const fromPhone = msg.from;   // E.164 without +, e.g. "919876543210"
        const text = msg.text?.body ?? "";
        const waMessageId = msg.id;

        // Find the lead by phone number
        const normalised = fromPhone.startsWith("91")
          ? fromPhone.slice(2)   // strip country code for DB lookup
          : fromPhone;

        const { data: lead } = await sb
          .from("leads")
          .select("id, user_id, company")
          .or(`phone.eq.${normalised},phone.eq.+${fromPhone},phone.eq.${fromPhone}`)
          .limit(1)
          .single();

        if (!lead) {
          // Unknown number — log and skip
          console.warn(`WhatsApp reply from unknown number: ${fromPhone}`);
          continue;
        }

        // Find the most recent outbound comm for this lead
        const { data: lastComm } = await sb
          .from("communications")
          .select("id")
          .eq("lead_id", lead.id)
          .eq("direction", "outbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .single();

        // Store inbound message in communications table
        const { data: inboundComm } = await sb
          .from("communications")
          .insert({
            user_id: lead.user_id,
            lead_id: lead.id,
            direction: "inbound",
            channel: "whatsapp",
            content: text,
            status: "received",
            external_id: waMessageId,
            received_at: new Date(parseInt(msg.timestamp) * 1000).toISOString(),
            language: detectLanguage(text),
          })
          .select("id")
          .single();

        if (!inboundComm) continue;

        // Update lead status to "replied"
        await sb
          .from("leads")
          .update({ status: "replied", last_replied_at: new Date().toISOString() })
          .eq("id", lead.id);

        // 🔥 Fire inngest event → triggers lead-qualifier → if qualified → notifies Manthan
        await inngest.send({
          name: "lead/reply.received",
          data: {
            user_id: lead.user_id,
            lead_id: lead.id,
            comm_id: lastComm?.id ?? inboundComm.id,
            reply_text: text,
          },
        });

        console.log(`📩 Reply from ${lead.company} (${fromPhone}): "${text.slice(0, 50)}"`);
      }
    }
  }

  // Always return 200 to Meta — otherwise they retry
  return NextResponse.json({ status: "ok" });
}

// ── Types ────────────────────────────────────────────────────────────────────

type WhatsAppWebhookBody = {
  object: string;
  entry: Array<{
    changes: Array<{
      value: {
        messages?: Array<{
          id: string;
          from: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
};

// Simple language detection for incoming messages
function detectLanguage(text: string): "gujarati" | "hinglish" | "english" {
  // Gujarati unicode range: \u0A80-\u0AFF
  if (/[\u0A80-\u0AFF]/.test(text)) return "gujarati";
  // Hindi/Devanagari: \u0900-\u097F
  if (/[\u0900-\u097F]/.test(text)) return "hinglish";
  return "english";
}
