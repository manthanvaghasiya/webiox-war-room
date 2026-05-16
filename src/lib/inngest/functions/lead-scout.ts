import { createClient } from "@supabase/supabase-js";

import { inngest, leadScoutEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import type {
  LeadChannel,
  LeadLanguage,
  LeadSegment,
  SolutionType,
} from "@/types/database";

// `full_name` is a generated column in Postgres (trim(concat(first_name,' ',
// last_name))). Do NOT include it in seed records or inserts — Supabase rejects
// non-DEFAULT values for generated columns. The defensive destructure in the
// batch builder below also strips it if it sneaks back in via a later edit.
type SeedLead = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  whatsapp_number: string | null;
  company: string;
  job_title: string | null;
  industry: string | null;
  company_size: number | null;
  location: string | null;
  address: string | null;
  linkedin_url: string | null;
  website: string | null;
  segment: LeadSegment;
  preferred_channel: LeadChannel;
  preferred_language: LeadLanguage;
  google_maps_url: string | null;
  google_rating: number | null;
  review_count: number | null;
  business_category: string | null;
  recommended_solution: SolutionType;
  solution_reason: string;
};

// 15 seed records — 8 b2b_global (English, email) + 7 local_india (Hinglish, whatsapp).
const DEMO_LEADS: SeedLead[] = [
  // ------- B2B Global (8) -----------------------------------------------------
  {
    first_name: "Sarah", last_name: "Chen",
    email: "sarah.chen@flowmetric.io",
    phone: "+1 415 555 0182", whatsapp_number: null,
    company: "FlowMetric", job_title: "VP of Growth", industry: "SaaS",
    company_size: 85, location: "San Francisco, CA",
    address: "535 Mission St, San Francisco, CA 94105, USA",
    linkedin_url: "https://linkedin.com/in/sarahchen-fm",
    website: "https://flowmetric.io",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "automation",
    solution_reason:
      "FlowMetric is a scaling SaaS — internal ops (onboarding, billing, CRM sync) are the growth bottleneck, so automation workflows beat another marketing site.",
  },
  {
    first_name: "Marcus", last_name: "Reid",
    email: "marcus@northpeak.agency",
    phone: "+1 415 555 0247", whatsapp_number: null,
    company: "Northpeak Digital", job_title: "Founder", industry: "Marketing Agency",
    company_size: 22, location: "Austin, TX",
    address: "1100 Congress Ave, Austin, TX 78701, USA",
    linkedin_url: "https://linkedin.com/in/marcusreid",
    website: "https://northpeak.agency",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "multi",
    solution_reason:
      "Northpeak is a marketing agency that resells delivery capacity — a multi-solution white-label partnership is the highest-LTV pitch.",
  },
  {
    first_name: "Priya", last_name: "Krishnan",
    email: "priya@layerstack.dev",
    phone: "+1 415 555 0319", whatsapp_number: null,
    company: "LayerStack", job_title: "Head of Engineering", industry: "SaaS",
    company_size: 140, location: "London, UK",
    address: "20 Farringdon Rd, London EC1M 3HE, UK",
    linkedin_url: "https://linkedin.com/in/priyakrishnan",
    website: "https://layerstack.dev",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "automation",
    solution_reason:
      "LayerStack ships developer tooling at 140 staff — process automation across support and release pipelines compounds faster than UI work.",
  },
  {
    first_name: "Elena", last_name: "Vasquez",
    email: "elena.v@brightcart.com",
    phone: "+1 415 555 0426", whatsapp_number: null,
    company: "BrightCart", job_title: "Director of E-commerce", industry: "E-commerce",
    company_size: 60, location: "Toronto, Canada",
    address: "250 Yonge St, Toronto, ON M5B 2L7, Canada",
    linkedin_url: "https://linkedin.com/in/elena-vasquez-brightcart",
    website: "https://brightcart.com",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "website",
    solution_reason:
      "BrightCart's storefront conversion is the lever at this stage — a rebuilt, faster e-commerce site lifts revenue before app channels make sense.",
  },
  {
    first_name: "David", last_name: "Okonkwo",
    email: "david@harborline-realty.com",
    phone: "+1 415 555 0573", whatsapp_number: null,
    company: "Harborline Realty", job_title: "Managing Broker", industry: "Real Estate",
    company_size: 38, location: "Miami, FL",
    address: "1450 Brickell Ave, Miami, FL 33131, USA",
    linkedin_url: "https://linkedin.com/in/davidokonkwo",
    website: "https://harborline-realty.com",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "crm",
    solution_reason:
      "Real estate is long-cycle and high-touch — Harborline leaks deals without pipeline visibility, so a CRM with nurture automation is the fix.",
  },
  {
    first_name: "Yuki", last_name: "Tanaka",
    email: "yuki@pulsewave.app",
    phone: "+1 415 555 0688", whatsapp_number: null,
    company: "Pulsewave", job_title: "Chief Revenue Officer", industry: "SaaS",
    company_size: 210, location: "Singapore",
    address: "8 Marina Blvd, Singapore 018981",
    linkedin_url: "https://linkedin.com/in/yukitanaka-pw",
    website: "https://pulsewave.app",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "automation",
    solution_reason:
      "Pulsewave is enterprise SaaS at 210 people — revenue ops automation (lead routing, renewals) is where the CRO recovers lost hours.",
  },
  {
    first_name: "Hannah", last_name: "Klein",
    email: "hannah@nordform.studio",
    phone: "+1 415 555 0791", whatsapp_number: null,
    company: "Nordform Studio", job_title: "Creative Director", industry: "Marketing Agency",
    company_size: 14, location: "Berlin, Germany",
    address: "Torstraße 109, 10119 Berlin, Germany",
    linkedin_url: "https://linkedin.com/in/hannahklein-nf",
    website: "https://nordform.studio",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "website",
    solution_reason:
      "Nordform is a 14-person creative studio — a portfolio-grade marketing site is both their shopfront and a reference build for their own clients.",
  },
  {
    first_name: "Rafael", last_name: "Costa",
    email: "rafael@vintaleather.co",
    phone: "+1 415 555 0834", whatsapp_number: null,
    company: "Vinta Leather Co.", job_title: "Head of DTC", industry: "E-commerce",
    company_size: 45, location: "São Paulo, Brazil",
    address: "Av. Paulista 1374, São Paulo, SP 01310-100, Brazil",
    linkedin_url: "https://linkedin.com/in/rafaelcosta-vl",
    website: "https://vintaleather.co",
    segment: "b2b_global", preferred_channel: "email", preferred_language: "english",
    google_maps_url: null, google_rating: null, review_count: null, business_category: null,
    recommended_solution: "mobile_app",
    solution_reason:
      "Vinta is a 45-person DTC brand with repeat buyers — a branded mobile app with push notifications outperforms email for re-purchase.",
  },

  // ------- Local India · Gujarat (7) -----------------------------------------
  {
    first_name: "Jignesh", last_name: "Patel",
    email: "jignesh@spicecorner.in",
    phone: "+91 98240 01000", whatsapp_number: "+91 98240 01000",
    company: "Spice Corner Restaurant", job_title: "Owner", industry: "Restaurant",
    company_size: 12, location: "Ahmedabad, Gujarat",
    address: "Shop 12, CG Road, Navrangpura, Ahmedabad, Gujarat 380009",
    linkedin_url: null,
    website: "https://spicecorner.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=spice-corner-ahmedabad",
    google_rating: 4.3, review_count: 412, business_category: "Restaurant",
    recommended_solution: "multi",
    solution_reason:
      "Spice Corner needs both a fresh site and online ordering — bundling a rebuild with a loyalty/ordering flow captures margin the aggregators skim.",
  },
  {
    first_name: "Hetal", last_name: "Shah",
    email: "drhetal@smilebrightdental.in",
    phone: "+91 98981 12000", whatsapp_number: "+91 98981 12000",
    company: "SmileBright Dental Clinic", job_title: "Founder & Dentist", industry: "Healthcare",
    company_size: 6, location: "Surat, Gujarat",
    address: "Shop 4, Ghod Dod Road, Athwa, Surat, Gujarat 395007",
    linkedin_url: null,
    website: "https://smilebrightdental.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=smilebright-surat",
    google_rating: 4.7, review_count: 286, business_category: "Clinic",
    recommended_solution: "multi",
    solution_reason:
      "SmileBright would gain from a modern site plus an appointment/records system — a bundled package fixes both visibility and no-shows.",
  },
  {
    first_name: "Riya", last_name: "Mehta",
    email: "riya@glowstudio.co.in",
    phone: "+91 73832 23000", whatsapp_number: "+91 73832 23000",
    company: "Glow Studio Salon", job_title: "Co-founder", industry: "Beauty & Wellness",
    company_size: 8, location: "Vadodara, Gujarat",
    address: "Shop 7, Alkapuri, Vadodara, Gujarat 390007",
    linkedin_url: null,
    website: "https://glowstudio.co.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=glow-studio-vadodara",
    google_rating: 4.5, review_count: 198, business_category: "Salon",
    recommended_solution: "mobile_app",
    solution_reason:
      "Glow Studio's repeat clients book on the move — a salon app with slot booking and reminders drives rebookings and reduces gaps.",
  },
  {
    first_name: "Karan", last_name: "Joshi",
    email: "karan@fitforge.in",
    phone: "+91 97123 34000", whatsapp_number: "+91 97123 34000",
    company: "FitForge Gym", job_title: "Owner", industry: "Fitness",
    company_size: 14, location: "Rajkot, Gujarat",
    address: "Shop 21, Kalawad Road, Rajkot, Gujarat 360005",
    linkedin_url: null,
    website: "https://fitforge.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=fitforge-rajkot",
    google_rating: 4.6, review_count: 521, business_category: "Gym",
    recommended_solution: "mobile_app",
    solution_reason:
      "Gym retention runs on class booking and streaks — a member app keeps FitForge's schedules and milestones in one place to cut churn.",
  },
  {
    first_name: "Anjali", last_name: "Trivedi",
    email: "anjali@silkthreadbtq.in",
    phone: "+91 98254 45000", whatsapp_number: "+91 98254 45000",
    company: "Silk Thread Boutique", job_title: "Designer & Owner", industry: "Retail",
    company_size: 5, location: "Ahmedabad, Gujarat",
    address: "Shop 9, Law Garden, Ellisbridge, Ahmedabad, Gujarat 380006",
    linkedin_url: null,
    website: null,
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=silkthread-ahmedabad",
    google_rating: 4.4, review_count: 142, business_category: "Boutique",
    recommended_solution: "website",
    solution_reason:
      "Boutique buyers research online before walking in — a catalog site with WhatsApp inquiry shortens Silk Thread's buying loop.",
  },
  {
    first_name: "Rakesh", last_name: "Vyas",
    email: "rakesh@thalighar.in",
    phone: "+91 89805 56000", whatsapp_number: "+91 89805 56000",
    company: "Thali Ghar", job_title: "Proprietor", industry: "Restaurant",
    company_size: 22, location: "Surat, Gujarat",
    address: "Shop 15, Adajan, Surat, Gujarat 395009",
    linkedin_url: null,
    website: "https://thalighar.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=thalighar-surat",
    google_rating: 4.2, review_count: 678, business_category: "Restaurant",
    recommended_solution: "website",
    solution_reason:
      "Thali Ghar's high review volume isn't matched by a strong web presence — a modern site converts that reputation into discovery traffic.",
  },
  {
    first_name: "Meera", last_name: "Desai",
    email: "meera@auracareclinic.in",
    phone: "+91 99256 67000", whatsapp_number: "+91 99256 67000",
    company: "AuraCare Skin Clinic", job_title: "Dermatologist & Owner", industry: "Healthcare",
    company_size: 9, location: "Vadodara, Gujarat",
    address: "Shop 3, Fatehgunj, Vadodara, Gujarat 390002",
    linkedin_url: null,
    website: "https://auracareclinic.in",
    segment: "local_india", preferred_channel: "whatsapp", preferred_language: "hinglish",
    google_maps_url: "https://maps.google.com/?cid=auracare-vadodara",
    google_rating: 4.8, review_count: 304, business_category: "Clinic",
    recommended_solution: "crm",
    solution_reason:
      "A skin clinic lives on appointments and follow-up courses — a CRM with WhatsApp reminders keeps AuraCare's calendar full and patients on plan.",
  },
];

export const leadScoutFn = inngest.createFunction(
  {
    id: "lead-scout",
    name: "Lead Scout",
    retries: 2,
    triggers: [{ event: leadScoutEvent }, { cron: "30 3 * * *" }],
  },
  async ({ event, step }) => {
    // event triggers carry data.user_id; cron triggers don't — fan out to all
    // users. Discriminate by event.name; the Inngest v4 union puts the cron
    // payload (`{ cron: string }`) alongside the leadScoutEvent payload.
    const isLeadScoutEvent = event.name === leadScoutEvent.name;
    const eventData = isLeadScoutEvent
      ? (event.data as {
          user_id?: string;
          mode?: "demo" | "apollo" | "google";
          limit?: number;
        })
      : null;

    const userIds = await step.run("resolve-users", async () => {
      if (eventData?.user_id) return [eventData.user_id];
      const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      );
      const { data } = await sb.from("settings").select("user_id");
      return (data ?? []).map((r: { user_id: string }) => r.user_id);
    });

    const results: Array<{ userId: string; inserted_count: number; mode: string }> = [];

    for (const userId of userIds) {
      const result = await step.run(`run-for-${userId}`, async () => {
        return await runAgent(
          "lead_scout",
          userId,
          "Scout leads (demo mode)",
          async (ctx) => {
            const { data: settings } = await ctx.supabase
              .from("settings")
              .select("daily_lead_limit")
              .eq("user_id", userId)
              .single();

            const requested =
              eventData?.limit ?? settings?.daily_lead_limit ?? 50;
            const limit = Math.min(requested, DEMO_LEADS.length);
            const mode = eventData?.mode ?? "demo";

            await ctx.log(`Scouting in ${mode} mode, target ${limit} leads`, {
              action: "scout_start",
              metadata: { mode, limit },
            });

            // Demo leads keep a stable identity across runs — the unique
            // index on (user_id, lower(company)) makes re-runs idempotent, so
            // emails/phones are inserted as-is.
            // Defensive destructure: strip `full_name` if it ever slips back
            // into a seed entry, since it's a generated column Postgres won't
            // accept non-DEFAULT values for.
            const batch = DEMO_LEADS.slice(0, limit).map((l) => {
              const { full_name: _omit, ...rest } = l as SeedLead & {
                full_name?: string;
              };
              void _omit;
              return {
                ...rest,
                user_id: userId,
                status: "new" as const,
                source: "demo",
                research_note: `Generated by Lead Scout demo mode at ${new Date().toISOString()}`,
              };
            });

            // Skip companies already in the pipeline rather than updating them.
            const { data: inserted, error } = await ctx.supabase
              .from("leads")
              .upsert(batch, {
                onConflict: "user_id,company",
                ignoreDuplicates: true,
              })
              .select("id, first_name, last_name, company, segment");

            if (error) throw new Error(`DB insert failed: ${error.message}`);

            const insertedCount = inserted?.length ?? 0;
            const skippedCount = batch.length - insertedCount;
            await ctx.log(
              `Lead Scout run: ${insertedCount} new leads added (${skippedCount} duplicates skipped, already in pipeline)`,
              {
              action: "leads_inserted",
              level: "success",
              target_table: "leads",
              metadata: { count: insertedCount, mode },
            });

            for (const lead of inserted ?? []) {
              await ctx.log(
                `Found: ${lead.first_name} ${lead.last_name} at ${lead.company} (${lead.segment})`,
                {
                  action: "lead_found",
                  target_table: "leads",
                  target_id: lead.id,
                  metadata: { segment: lead.segment },
                },
              );
            }

            return { inserted_count: insertedCount, mode };
          },
        );
      });

      results.push({ userId, ...result });
    }

    return { runs: results };
  },
);
