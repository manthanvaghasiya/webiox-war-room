// Meta WhatsApp Cloud API — free tier, no per-message cost for business-initiated
// template messages after 24hr window. Conversation-initiated (reply within 24h)
// are completely free.
//
// Required env vars:
//   WHATSAPP_PHONE_NUMBER_ID  — from Meta Developer Console → WhatsApp → API Setup
//   WHATSAPP_ACCESS_TOKEN     — System User permanent token (never the temp token)
//   WHATSAPP_VERIFY_TOKEN     — any random string you set in webhook config

const BASE = "https://graph.facebook.com/v19.0";

export type WaTextResult =
  | { ok: true; message_id: string }
  | { ok: false; error: string };

// Send a free-form text message (only works within 24hr reply window,
// OR if you have a pre-approved template for the first contact).
// For FIRST outreach to a cold lead use sendTemplate() below.
export async function sendText(
  to: string,
  body: string,
): Promise<WaTextResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set" };
  }

  const phone = normalisePhone(to);
  if (!phone) return { ok: false, error: `Invalid phone number: ${to}` };

  try {
    const res = await fetch(`${BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "text",
        text: { body, preview_url: false },
      }),
    });

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true, message_id: data.messages?.[0]?.id ?? "" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Send a pre-approved template message — required for FIRST outreach to cold leads.
// Template must be approved in Meta Business Manager.
//
// We use a single utility template "webiox_cold_outreach" with 3 components:
//   {{1}} = business name (e.g. "Sunrise Realty")
//   {{2}} = city (e.g. "Ahmedabad")
//   {{3}} = short pitch (e.g. "website + CRM package")
//
// Create this template in Meta Business Manager → WhatsApp → Message Templates
// Category: UTILITY | Language: en / hi / gu
export async function sendTemplate(opts: {
  to: string;
  template: string;           // e.g. "webiox_cold_outreach"
  language: string;           // e.g. "en" | "hi" | "gu"
  components?: Array<{
    type: "body" | "header";
    parameters: Array<{ type: "text"; text: string }>;
  }>;
}): Promise<WaTextResult> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneId || !token) {
    return { ok: false, error: "WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set" };
  }

  const phone = normalisePhone(opts.to);
  if (!phone) return { ok: false, error: `Invalid phone number: ${opts.to}` };

  try {
    const res = await fetch(`${BASE}/${phoneId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: opts.template,
          language: { code: opts.language },
          components: opts.components ?? [],
        },
      }),
    });

    const data = (await res.json()) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };

    if (!res.ok || data.error) {
      return { ok: false, error: data.error?.message ?? `HTTP ${res.status}` };
    }

    return { ok: true, message_id: data.messages?.[0]?.id ?? "" };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Send Manthan a WhatsApp alert (to his own number) when a lead qualifies.
// Uses free-form text since Manthan is a real conversation, not a cold lead.
export async function notifyManthan(message: string): Promise<WaTextResult> {
  const myNumber = process.env.WHATSAPP_MY_NUMBER; // Manthan's personal WA number
  if (!myNumber) {
    return { ok: false, error: "WHATSAPP_MY_NUMBER not set" };
  }
  return sendText(myNumber, message);
}

// Normalise Indian phone numbers to E.164 format (+91XXXXXXXXXX).
// Handles: 9876543210, +919876543210, 919876543210, 0091...
function normalisePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("091")) return `+${digits.slice(1)}`;
  if (digits.startsWith("+")) return raw.trim();
  // International numbers already in E.164 (no leading +)
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}
