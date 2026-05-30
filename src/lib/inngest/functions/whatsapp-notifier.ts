// Fired after lead-qualifier promotes a lead to qualified_leads.
// Sends Manthan a WhatsApp alert with:
//   • Lead name + company + city
//   • Score + why they're hot
//   • Full conversation log so far
//   • Call script preview
//   • Deep link to dashboard card

import { inngest } from "../client";
import { notifyManthan } from "@/lib/whatsapp";
import type { Lead } from "@/types/database";
import { eventType, staticSchema } from "inngest";

export const whatsappNotifyEvent = eventType("lead/qualified.notify", {
  schema: staticSchema<{
    user_id: string;
    lead_id: string;
    score: number;
    reason: string;
  }>(),
});

export const whatsappNotifierFn = inngest.createFunction(
  {
    id: "whatsapp-notifier",
    name: "WhatsApp Notifier (Manthan Alert)",
    retries: 3,
    triggers: [{ event: "lead/qualified.notify" }],
  },
  async ({ event }) => {
    const { user_id, lead_id, score, reason } = event.data;

    // Build Supabase client
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // Fetch lead details
    const { data: lead } = await sb
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (!lead) return { ok: false, error: "Lead not found" };

    const l = lead as Lead;

    // Fetch last 3 communications (conversation so far)
    const { data: comms } = await sb
      .from("communications")
      .select("direction, body, sent_at, channel")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false })
      .limit(3);

    // Build conversation snippet
    const convLines = (comms ?? [])
      .reverse()
      .map((c) => {
        const who = c.direction === "outbound" ? "🤖 We" : "👤 Lead";
        const time = c.sent_at
          ? new Date(c.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
          : "";
        return `${who} (${time}):\n${(c.body ?? "").slice(0, 120)}${(c.body?.length ?? 0) > 120 ? "…" : ""}`;
      })
      .join("\n\n");

    // Dashboard deep link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://unfeelable.ai";
    const dashLink = `${baseUrl}/leads/${lead_id}`;

    // Signals summary
    const signals: string[] = [];
    if (l.has_instagram) signals.push("📸 Instagram");
    if (l.has_website) signals.push("🌐 Website");
    if ((l.review_count ?? 0) >= 100) signals.push(`⭐ ${l.review_count} reviews`);
    if (l.running_ads) signals.push("💰 Running ads");
    const signalStr = signals.length > 0 ? signals.join(" · ") : "Phone + Rating";

    const message = [
      `🔥 *HOT LEAD QUALIFIED!*`,
      ``,
      `*${l.company ?? "Unknown"}*`,
      `📍 ${l.city ?? l.location ?? "Gujarat"} · ${l.industry ?? "Real Estate"}`,
      `📞 ${l.phone ?? "No phone"}`,
      l.email ? `📧 ${l.email}` : null,
      ``,
      `📊 *Score: ${score}/100*`,
      `💡 ${reason}`,
      ``,
      `🔍 *Signals:* ${signalStr}`,
      ``,
      comms && comms.length > 0
        ? `💬 *Last conversation:*\n${convLines}`
        : `💬 First contact — no replies yet`,
      ``,
      `📋 *Recommended:* ${l.recommended_solution ?? "website + CRM"}`,
      ``,
      `👉 *Open in dashboard:*\n${dashLink}`,
    ]
      .filter((l) => l !== null)
      .join("\n");

    const result = await notifyManthan(message);

    // Log notification to DB
    await sb.from("agent_logs").insert({
      user_id,
      agent_name: "whatsapp_notifier",
      action: "lead_qualified_notify",
      level: result.ok ? "success" : "error",
      message: result.ok
        ? `✅ Notified Manthan about ${l.company} (score: ${score})`
        : `❌ Failed to notify Manthan: ${result.error}`,
      target_table: "leads",
      target_id: lead_id,
      metadata: { score, result },
    });

    return result;
  },
);
