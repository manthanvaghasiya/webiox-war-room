import { createClient } from "@supabase/supabase-js";

import { inngest, leadScoutEvent } from "../client";
import { runAgent } from "@/lib/agents/runner";
import {
  GUJARAT_CITIES,
  VERTICALS,
  buildCallScript,
  detectSolutionForLead,
  filterPremium,
  searchPlacesForVertical,
  stackSignals,
  type DetectedSolution,
  type PlacesRaw,
  type SignalScore,
} from "@/lib/agents/google-places-helpers";
import { generateWhyReason } from "@/lib/agents/why-reason";
import type {
  LeadChannel,
  LeadLanguage,
  LeadSegment,
  SolutionType,
} from "@/types/database";

type LeadScoutEventData = {
  user_id?: string;
  mode?: "demo" | "real";
  vertical?: string;
  cities?: string[];
  limit?: number;
};

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

// ===== Demo mode =============================================================
// The original Lead Scout: inserts the 15 curated DEMO_LEADS. Kept verbatim so
// screen recordings work with no API keys. Also the cron + cron-fallback path.
async function demoLeadScout(
  userId: string,
  eventData: LeadScoutEventData | null,
) {
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

      const requested = eventData?.limit ?? settings?.daily_lead_limit ?? 50;
      const limit = Math.min(requested, DEMO_LEADS.length);

      await ctx.log(`Scouting in demo mode, target ${limit} leads`, {
        action: "scout_start",
        metadata: { mode: "demo", limit },
      });

      // Demo leads keep a stable identity across runs — the unique index on
      // (user_id, lower(company)) makes re-runs idempotent, so emails/phones
      // are inserted as-is.
      // Defensive destructure: strip `full_name` if it ever slips back into a
      // seed entry, since it's a generated column Postgres won't accept
      // non-DEFAULT values for.
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
          metadata: { count: insertedCount, mode: "demo" },
        },
      );

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

      return { inserted_count: insertedCount, mode: "demo" as const };
    },
  );
}

// ===== Real mode =============================================================
// Hunts real premium businesses via Google Places API (New), checks each for
// active Facebook ads, scores them, and stores the top N as hot leads.
async function realLeadScout(userId: string, opts: LeadScoutEventData) {
  return await runAgent(
    "lead_scout",
    userId,
    "Real lead scout (Google Places + Ad Library)",
    async (ctx) => {
      // Real mode FAILS FAST if the key is missing — log and exit cleanly so
      // the agent lands back in `idle`, not `error`.
      if (!process.env.GOOGLE_PLACES_API_KEY) {
        await ctx.log(
          "Real Lead Scout aborted: GOOGLE_PLACES_API_KEY is not set",
          { action: "real_scout_no_key", level: "error" },
        );
        return { inserted_count: 0, total: 0, vertical: null, mode: "real" as const };
      }

      const { data: settings } = await ctx.supabase
        .from("settings")
        .select(
          "target_vertical, search_cities, min_rating, min_reviews, max_results_per_run, custom_keyword, exclude_franchises, require_preowned_keyword, prioritize_no_website, target_solutions",
        )
        .eq("user_id", userId)
        .single();

      // Event payload still wins (lets us trigger one-off runs from the UI),
      // then settings, then sensible defaults if the user hasn't saved yet.
      const verticalId =
        opts.vertical ?? settings?.target_vertical ?? "car_dealer";
      const vertical = VERTICALS[verticalId];
      if (!vertical) throw new Error(`Unknown vertical: ${verticalId}`);

      const cities =
        opts.cities ??
        (settings?.search_cities?.length
          ? settings.search_cities
          : GUJARAT_CITIES);
      const minReviews = settings?.min_reviews ?? 100;
      const minRating = settings?.min_rating
        ? Number(settings.min_rating)
        : 4.0;
      const maxResults = settings?.max_results_per_run ?? 50;
      const customKeyword = settings?.custom_keyword?.trim() || null;
      const excludeFranchises = settings?.exclude_franchises ?? true;
      const requirePreowned = settings?.require_preowned_keyword ?? false;
      const prioritizeNoWebsite = settings?.prioritize_no_website ?? true;

      await ctx.log(
        `Hunting ${vertical.label} in ${cities.join(", ")} (≥${minReviews} reviews, ≥${minRating}★, custom="${customKeyword ?? "none"}", maxResults=${maxResults}, excludeFranchises=${excludeFranchises}, requirePreowned=${requirePreowned}, prioritizeNoWebsite=${prioritizeNoWebsite})`,
        {
          action: "scout_start",
          metadata: {
            vertical: verticalId,
            cities,
            minReviews,
            minRating,
            maxResults,
            customKeyword,
            excludeFranchises,
            requirePreowned,
            prioritizeNoWebsite,
          },
        },
      );

      // For each city: search → filter premium → collect.
      const allRaw: PlacesRaw[] = [];
      for (const city of cities) {
        const raws = await searchPlacesForVertical(
          vertical,
          city,
          20,
          customKeyword,
        );
        const filtered = filterPremium(raws, {
          minReviews,
          minRating,
          excludeKeywords: vertical.excludeKeywords,
          excludeFranchises,
          requirePreownedKeyword: requirePreowned,
        });
        await ctx.log(`${city}: ${raws.length} found, ${filtered.length} premium`, {
          action: "city_done",
          metadata: { city, found: raws.length, premium: filtered.length },
        });
        for (const r of filtered) (r as PlacesRaw & { __city?: string }).__city = city;
        allRaw.push(...filtered);
      }

      // Sort by review count DESC, take top (maxResults × 2) for signal-stacking.
      allRaw.sort(
        (a, b) => (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0),
      );
      const candidates = allRaw.slice(0, maxResults * 2);

      // Multi-location heuristic — same brand keyword across 2+ candidates.
      // Used downstream to bias the recommended_solution toward custom software
      // for businesses likely to need it.
      const isMultiLoc = (raw: PlacesRaw): boolean => {
        const name = raw.displayName?.text ?? "";
        const brandKey = name
          .split(/[(,–-]/)[0]
          .trim()
          .toLowerCase()
          .slice(0, 12);
        if (!brandKey) return false;
        const sameBrandCount = allRaw.filter((r) =>
          (r.displayName?.text ?? "").toLowerCase().includes(brandKey),
        ).length;
        return sameBrandCount >= 2;
      };

      // Run all 8 signal checks per candidate (8s timeout per network call).
      // Weak-tier leads are filtered out here — they never reach the DB.
      const enriched: Array<{
        raw: PlacesRaw;
        city: string;
        multiLoc: boolean;
        signals: SignalScore;
      }> = [];

      for (const raw of candidates) {
        const city = (raw as PlacesRaw & { __city?: string }).__city ?? "";
        const businessName = raw.displayName?.text ?? "Unknown";

        await ctx.log(`Stacking signals: ${businessName}`, {
          action: "signals_check",
          metadata: { business: businessName, city },
        });

        const signals = await stackSignals({
          raw,
          city,
          vertical: verticalId,
          excludeFranchises,
          minReviews,
          minRating,
        });

        if (signals.tier === "weak") {
          await ctx.log(
            `Skipped ${businessName}: weak signal (${signals.confidence}%)`,
            {
              action: "lead_skipped",
              level: "info",
              metadata: {
                confidence: signals.confidence,
                reasoning: signals.reasoning.join(" | "),
              },
            },
          );
          continue;
        }

        enriched.push({
          raw,
          city,
          multiLoc: isMultiLoc(raw),
          signals,
        });
      }

      // Step 14 — classify each lead's recommended solution, then apply the
      // user's target_solutions filter. `multi` always passes since it's a
      // superset of every individual solution.
      const ALL_TARGET_SOLUTIONS = [
        "website",
        "custom_software",
        "automation",
      ] as const;
      const userSolutionsRaw: string[] =
        settings?.target_solutions && settings.target_solutions.length > 0
          ? settings.target_solutions
          : [...ALL_TARGET_SOLUTIONS];
      const userSolutions = userSolutionsRaw.filter(
        (s: string): s is (typeof ALL_TARGET_SOLUTIONS)[number] =>
          (ALL_TARGET_SOLUTIONS as readonly string[]).includes(s),
      );
      const isRandomMode =
        userSolutions.length === 0 ||
        userSolutions.length === ALL_TARGET_SOLUTIONS.length;

      const detected = enriched.map((e) => ({
        ...e,
        solution: detectSolutionForLead({
          raw: e.raw,
          signals: e.signals,
          vertical: verticalId,
        }),
      }));

      let filtered = detected;
      if (!isRandomMode) {
        filtered = detected.filter(
          (d) =>
            d.solution === "multi" ||
            (userSolutions as readonly string[]).includes(d.solution),
        );
        await ctx.log(
          `Filtered ${detected.length} → ${filtered.length} leads matching solutions: ${userSolutions.join(", ")}`,
          {
            action: "solution_filter",
            metadata: {
              solutions: userSolutions,
              before: detected.length,
              after: filtered.length,
            },
          },
        );
      }

      // Tier first (confirmed > probable), confidence breaks the tie.
      // When prioritizeNoWebsite is on, NO-WEBSITE leads float to the top of
      // each tier — easier pitch.
      filtered.sort((a, b) => {
        if (a.signals.tier !== b.signals.tier) {
          return a.signals.tier === "confirmed" ? -1 : 1;
        }
        if (prioritizeNoWebsite) {
          const aNoSite = !a.raw.websiteUri ? 1 : 0;
          const bNoSite = !b.raw.websiteUri ? 1 : 0;
          if (aNoSite !== bNoSite) return bNoSite - aNoSite;
        }
        return b.signals.confidence - a.signals.confidence;
      });

      // Caller limit wins, falling back to the user's max_results_per_run.
      // Hard cap of 100 keeps a runaway setting from blowing up a run.
      const top = filtered.slice(0, Math.min(opts.limit ?? maxResults, 100));

      const confirmedCount = top.filter(
        (e) => e.signals.tier === "confirmed",
      ).length;
      const probableCount = top.filter(
        (e) => e.signals.tier === "probable",
      ).length;

      await ctx.log(
        `Top ${top.length} leads (${confirmedCount} confirmed · ${probableCount} probable) selected; weak filtered out`,
        {
          action: "top_selected",
          metadata: {
            count: top.length,
            confirmed: confirmedCount,
            probable: probableCount,
          },
        },
      );

      // Step 14 — single-line signals checklist that the leads table renders
      // under the solution badge. Each tick on its own with " • " separators
      // keeps the line scannable in the two-line clamp.
      const buildSignalsLine = (
        s: SignalScore,
        raw: PlacesRaw,
      ): string =>
        [
          s.has_good_rating && `${raw.rating ?? 0}★ rating ✓`,
          s.has_review_volume && `${raw.userRatingCount ?? 0} reviews ✓`,
          s.has_working_phone && "Phone available ✓",
          s.not_franchise && "Independent business ✓",
          s.has_recent_reviews && "Recent reviews ✓",
          s.running_paid_ads && "Running paid ads ✓",
          s.has_instagram && "Active Instagram ✓",
          s.has_verified_email && "Email verified ✓",
        ]
          .filter(Boolean)
          .join(" • ");

      // Map the detected solution (filter space) to the DB enum
      // (solution_type). 'custom_software' isn't in the enum — we store it as
      // 'crm' since that's the closest semantic match for the agency.
      const toDbSolution = (s: DetectedSolution): SolutionType => {
        if (s === "custom_software") return "crm";
        return s;
      };

      // Insert into the leads table — idempotent via the (user_id, company)
      // unique index.
      let inserted = 0;
      for (const e of top) {
        const raw = e.raw;
        const name = raw.displayName?.text ?? "Unknown";
        const hasWebsite = !!raw.websiteUri;

        // Pre-generate the call script and fold it into research_note so the
        // /leads page can surface + copy it without an extra fetch.
        const script = buildCallScript({
          name,
          contactName: "Owner",
          city: e.city,
          vertical: verticalId,
          reasoning: e.signals.reasoning.join(" • "),
          has_website: hasWebsite,
          running_ads: e.signals.running_paid_ads,
          has_instagram: e.signals.has_instagram,
          rating: raw.rating,
          reviews: raw.userRatingCount,
        });

        const tierUp = e.signals.tier.toUpperCase();
        const reasoningJoined = e.signals.reasoning.join(" • ");
        const signalsLine = buildSignalsLine(e.signals, raw);

        // Research-note layout:
        //   SIGNALS: <ticks joined with •>   ← table extracts this line
        //   <blank>
        //   TIER / INSTAGRAM / LATEST REVIEW metadata
        //   <blank>
        //   ---CALL SCRIPT (Hinglish/English/Gujarati)---
        const headerLines = [
          `SIGNALS: ${signalsLine}`,
          "",
          `TIER: ${tierUp} (${e.signals.confidence}%)`,
          `INSTAGRAM: ${e.signals.instagram_url ?? "none"}`,
          `LATEST REVIEW: ${e.signals.latest_review_date ?? "unknown"}`,
        ];
        if (e.multiLoc) headerLines.push("MULTI-LOCATION: yes");

        const researchNote = [
          ...headerLines,
          "",
          "---CALL SCRIPT (Hinglish)---",
          script.hinglish,
          "",
          "---CALL SCRIPT (English)---",
          script.english,
          "",
          "---CALL SCRIPT (ગુજરાતી)---",
          script.gujarati,
        ].join("\n");

        // AI-generated 1-sentence "Why this lead is hot" — shown directly
        // in the WHY column. Falls back to a template if Anthropic is
        // unavailable, so a missing key never blocks lead insertion.
        const whyReason = await generateWhyReason({
          business_name: name,
          city: e.city,
          rating: raw.rating ?? 0,
          reviews: raw.userRatingCount ?? 0,
          has_website: hasWebsite,
          running_ads: e.signals.running_paid_ads,
          has_instagram: e.signals.has_instagram,
          solution: e.solution,
          vertical_label: vertical.label,
        });

        const lead = {
          user_id: userId,
          company: name,
          // We don't have a real contact person — "Owner" is a placeholder;
          // the caller asks for the owner on the phone.
          first_name: "Owner",
          last_name: "",
          phone:
            raw.internationalPhoneNumber ?? raw.nationalPhoneNumber ?? null,
          website: raw.websiteUri ?? null,
          industry: vertical.label,
          business_category: vertical.id,
          location: `${e.city}, Gujarat, India`,
          address: raw.formattedAddress ?? null,
          google_maps_url: raw.googleMapsUri ?? null,
          google_rating: raw.rating ?? null,
          review_count: raw.userRatingCount ?? null,
          segment: "local_india" as const,
          preferred_channel: "whatsapp" as const,
          preferred_language: "gujarati" as const,
          status: "new" as const,
          source: "google_places",
          lead_score: e.signals.confidence,
          lead_score_reason: `${tierUp} — ${reasoningJoined}`,
          recommended_solution: toDbSolution(e.solution),
          solution_reason: whyReason,
          research_note: researchNote,
        };

        const { error } = await ctx.supabase
          .from("leads")
          .upsert([lead], {
            onConflict: "user_id,company",
            ignoreDuplicates: true,
          });

        if (!error) {
          inserted++;
          await ctx.log(
            `✓ ${name} — ${tierUp} (${e.signals.confidence}%)`,
            {
              action: "lead_inserted",
              target_table: "leads",
              level: "success",
              metadata: {
                name,
                tier: e.signals.tier,
                confidence: e.signals.confidence,
                running_paid_ads: e.signals.running_paid_ads,
                has_instagram: e.signals.has_instagram,
                has_recent_reviews: e.signals.has_recent_reviews,
                city: e.city,
                vertical: verticalId,
              },
            },
          );
        }
      }

      await ctx.log(
        `Real Lead Scout complete: ${inserted}/${top.length} new leads added (${confirmedCount} confirmed, ${probableCount} probable)`,
        {
          action: "real_scout_summary",
          level: "success",
          metadata: {
            inserted,
            total: top.length,
            confirmed: confirmedCount,
            probable: probableCount,
            vertical: verticalId,
          },
        },
      );

      return {
        inserted_count: inserted,
        total: top.length,
        confirmed: confirmedCount,
        probable: probableCount,
        vertical: verticalId,
        mode: "real" as const,
      };
    },
  );
}

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
      ? (event.data as LeadScoutEventData)
      : null;

    // Cron runs (no event data) always use demo mode.
    const mode = eventData?.mode ?? "demo";

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

    const results: Array<{ userId: string } & Record<string, unknown>> = [];

    for (const userId of userIds) {
      const result = await step.run(`run-for-${userId}`, async () => {
        return mode === "real"
          ? await realLeadScout(userId, eventData ?? {})
          : await demoLeadScout(userId, eventData);
      });

      results.push({ userId, ...result });
    }

    return { mode, runs: results };
  },
);
