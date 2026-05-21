// Google Places API (New) + Facebook Ad Library helpers — powers the real
// Lead Scout (Step 11). Every export is defensive: network calls never throw,
// they degrade to empty/false so a single bad city or business can't abort a
// scout run. All outbound calls carry an 8s AbortController timeout.
//
// The GOOGLE_PLACES_API_KEY is read here and ONLY here — it is passed straight
// into a request header and never logged. Callers should never touch the key.

import { extractDomain, findEmailsForDomain } from "./enricher-helpers";

// ===== Verticals =============================================================

export type VerticalConfig = {
  id: string;
  label: string;
  textQueries: (city: string) => string[]; // returns array of queries per city
  excludeKeywords?: string[]; // skip results whose name matches these
};

export const VERTICALS: Record<string, VerticalConfig> = {
  car_dealer: {
    id: "car_dealer",
    label: "Pre-Owned Car Dealer",
    textQueries: (city) => [
      `pre-owned cars ${city} Gujarat`,
      `used cars ${city} Gujarat`,
      `second hand cars ${city} Gujarat`,
      `buy sell exchange cars ${city} Gujarat`,
    ],
    excludeKeywords: [
      "service center",
      "workshop",
      "spare parts",
      "rental",
      "rent a car",
    ],
  },
  clinic: {
    id: "clinic",
    label: "Premium Clinic / Hospital",
    textQueries: (city) => [`multispeciality hospital ${city} Gujarat`],
  },
  gym: {
    id: "gym",
    label: "Premium Gym",
    textQueries: (city) => [`premium gym fitness ${city} Gujarat`],
  },
  boutique: {
    id: "boutique",
    label: "Designer Boutique",
    textQueries: (city) => [
      `designer boutique fashion store ${city} Gujarat`,
    ],
  },
  restaurant: {
    id: "restaurant",
    label: "Premium Restaurant",
    textQueries: (city) => [
      `fine dining premium restaurant ${city} Gujarat`,
    ],
  },
  law_firm: {
    id: "law_firm",
    label: "Law Firm",
    textQueries: (city) => [`law firm advocates ${city} Gujarat`],
  },
  jewelry: {
    id: "jewelry",
    label: "Jewelry Showroom",
    textQueries: (city) => [`jewelry showroom ${city} Gujarat`],
  },
  real_estate: {
    id: "real_estate",
    label: "Real Estate Builder/Broker",
    textQueries: (city) => [
      `real estate builder ${city}`,
      `property developer ${city}`,
      `real estate broker ${city}`,
    ],
    excludeKeywords: ["rental", "rent", "PG", "paying guest"],
  },
  school: {
    id: "school",
    label: "School / Coaching Institute",
    textQueries: (city) => [
      `coaching institute ${city}`,
      `tuition classes ${city}`,
      `private school ${city}`,
    ],
    excludeKeywords: ["government", "public school", "municipality"],
  },
  manufacturer: {
    id: "manufacturer",
    label: "Manufacturer / B2B Trader",
    textQueries: (city) => [
      `manufacturer ${city} india`,
      `wholesaler ${city}`,
      `B2B exporter ${city}`,
    ],
    excludeKeywords: ["retail", "shop", "showroom"],
  },
};

export const GUJARAT_CITIES = ["Ahmedabad", "Surat", "Vadodara", "Rajkot"];

// ===== Franchise Blocklist ===================================================

export const FRANCHISE_BLOCKLIST = [
  // OEM brands
  "nexa",
  "maruti",
  "hyundai",
  "tata motors",
  "mahindra",
  "kia",
  "honda",
  "toyota",
  "skoda",
  "volkswagen",
  "ford",
  "mg motor",
  "renault",
  "nissan",
  "bmw",
  "audi",
  "mercedes",
  "jaguar",
  "land rover",
  "volvo",
  "jeep",
  "isuzu",
  "datsun",
  "fiat",
  "chevrolet",
  "mini cooper",

  // Marketplace aggregators
  "cars24",
  "cardekho",
  "spinny",
  "olx",
  "cartrade",
  "droom",
  "mahindra first choice",
  "truebil",
  "car wale",
  "cargurus",
  "carwale",

  // Service-specific (not dealers)
  "true value",
  "blue ribbon",
];

// ===== Types =================================================================

export type PlacesRaw = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  internationalPhoneNumber?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  primaryType?: string;
  types?: string[];
};

const TIMEOUT_MS = 8_000;
const PLACES_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.internationalPhoneNumber",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.googleMapsUri",
  "places.primaryType",
  "places.types",
].join(",");

// fetch wrapper with an AbortController timeout. Returns null on any failure.
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ===== Franchise detection ===================================================

export function isFranchiseDealer(name: string): boolean {
  const n = name.toLowerCase();
  return FRANCHISE_BLOCKLIST.some((brand) => n.includes(brand.toLowerCase()));
}

// ===== Google Places search ==================================================

// Text-search a single vertical in a single city, running ALL queries and
// deduplicating by place ID. If `customKeyword` is given, the vertical's
// preset queries are replaced with a single `<keyword> <city>` query (see
// `getQueriesForVertical`). Returns [] on any error — never throws.
export async function searchPlacesForVertical(
  vertical: VerticalConfig,
  city: string,
  pageSize = 20,
  customKeyword?: string | null,
): Promise<PlacesRaw[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const queries = getQueriesForVertical(vertical, city, customKeyword);
  const allResults: PlacesRaw[] = [];
  const seenIds = new Set<string>();

  for (const query of queries) {
    try {
      const res = await fetchWithTimeout(
        "https://places.googleapis.com/v1/places:searchText",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": PLACES_FIELD_MASK,
          },
          body: JSON.stringify({
            textQuery: query,
            languageCode: "en",
            pageSize,
          }),
        },
      );

      if (!res || !res.ok) continue;

      let data: { places?: PlacesRaw[] };
      try {
        data = (await res.json()) as { places?: PlacesRaw[] };
      } catch {
        continue;
      }

      for (const p of data.places ?? []) {
        if (p.id && !seenIds.has(p.id)) {
          seenIds.add(p.id);
          allResults.push(p);
        } else if (!p.id) {
          // some results may not have an ID; dedupe by name+address fallback
          const key = `${p.displayName?.text ?? ""}|${p.formattedAddress ?? ""}`;
          if (!seenIds.has(key)) {
            seenIds.add(key);
            allResults.push(p);
          }
        }
      }
    } catch {
      // continue to next query on any error
    }
  }

  return allResults;
}

// ===== Premium filter ========================================================

export type PremiumOpts = {
  minReviews?: number;
  minRating?: number;
  excludeKeywords?: string[];
  // Step 12 — driven by user settings. Both default to the strict legacy
  // behavior so existing callers don't change shape.
  excludeFranchises?: boolean;
  requirePreownedKeyword?: boolean;
};

// Keep only premium-signal businesses: enough reviews, high rating, a usable
// phone number, and a name that doesn't match the vertical's exclude list.
// Optionally rejects franchise dealers and/or requires a pre-owned keyword
// in the name (independents-only mode).
export function filterPremium(
  raws: PlacesRaw[],
  opts: PremiumOpts = {},
): PlacesRaw[] {
  const minReviews = opts.minReviews ?? 100;
  const minRating = opts.minRating ?? 4.0;
  const excludes = (opts.excludeKeywords ?? []).map((k) => k.toLowerCase());
  const excludeFranchises = opts.excludeFranchises ?? true;
  const requirePreowned = opts.requirePreownedKeyword ?? false;

  return raws.filter((r) => {
    const name = (r.displayName?.text ?? "").toLowerCase();

    // Reject franchises (when the user wants independents only)
    if (excludeFranchises && isFranchiseDealer(name)) return false;

    // Reject keyword matches (service centers, etc.)
    if (excludes.some((k) => name.includes(k))) return false;

    // Strict independents filter — must mention pre-owned/used/etc.
    if (
      requirePreowned &&
      !/(pre.?owned|used|second.?hand|exchange)/i.test(name)
    ) {
      return false;
    }

    // Premium filters
    if ((r.userRatingCount ?? 0) < minReviews) return false;
    if ((r.rating ?? 0) < minRating) return false;

    // Drop entries with no phone number at all — uncallable, no use as a lead.
    if (!r.internationalPhoneNumber && !r.nationalPhoneNumber) return false;

    return true;
  });
}

// Resolve the search queries for a given vertical/city pair, honoring a
// user-supplied custom keyword override from settings. When `customKeyword` is
// provided, it REPLACES the vertical's preset queries with a single query
// per city.
export function getQueriesForVertical(
  vertical: VerticalConfig,
  city: string,
  customKeyword?: string | null,
): string[] {
  const kw = customKeyword?.trim();
  if (kw) return [`${kw} ${city}`];
  return vertical.textQueries(city);
}

// ===== Facebook Ad Library check =============================================

// Heuristic check for whether a business is running active Facebook/Instagram
// ads — a strong "investing in growth" buying signal.
//
// LIMITATION: the Ad Library results grid is JS-rendered, so a plain HTTP fetch
// only sees the static shell. This heuristic catches the static "no results"
// fallback reliably but will under-report active advertisers. It is imperfect
// by design — treated as a bonus signal, never as a blocker. Any error or
// timeout resolves to false so a lead is still added.
export async function checkRunningFacebookAds(
  businessName: string,
  city: string,
): Promise<boolean> {
  if (!businessName.trim()) return false;

  const q = encodeURIComponent(`${businessName} ${city}`.trim());
  const url =
    `https://www.facebook.com/ads/library/?active_status=active` +
    `&ad_type=all&country=IN&q=${q}&search_type=keyword_unordered`;

  const res = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WebioxBot/1.0)" },
  });
  if (!res || !res.ok) return false;

  let body: string;
  try {
    body = await res.text();
  } catch {
    return false;
  }

  const lower = body.toLowerCase();

  // Explicit "nothing found" markers win — definitely not advertising.
  if (lower.includes("no ads") || lower.includes("no results")) return false;

  // Otherwise look for any positive marker of a non-empty result set.
  if (/~?\s*\d[\d,]*\s*results/i.test(body)) return true;
  if (lower.includes("ads_archive") || lower.includes("library id")) return true;

  return false;
}

// ===== Recent reviews check (Google Places Details API) =====================

// Fetches up to 5 most-recent reviews and reports whether at least one is
// within the last 60 days. Used as the "active business" signal — old
// reviews mean the business may be on autopilot or stale.
//
// FieldMask is "reviews" only — keeps the per-request cost low. Returns
// has_recent=false on any error so a single bad place_id can't abort a run.
export async function checkRecentReviews(
  placeId: string,
): Promise<{ has_recent: boolean; latest_review_date: string | null }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey || !placeId)
    return { has_recent: false, latest_review_date: null };

  const res = await fetchWithTimeout(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`,
    {
      method: "GET",
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "reviews",
      },
    },
  );
  if (!res || !res.ok) return { has_recent: false, latest_review_date: null };

  let data: {
    reviews?: Array<{
      publishTime?: string;
      relativePublishTimeDescription?: string;
    }>;
  };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { has_recent: false, latest_review_date: null };
  }

  const reviews = data.reviews ?? [];
  if (reviews.length === 0)
    return { has_recent: false, latest_review_date: null };

  // Find the most recent valid publishTime.
  let latestMs = 0;
  let latestIso: string | null = null;
  for (const r of reviews) {
    if (!r.publishTime) continue;
    const t = Date.parse(r.publishTime);
    if (!Number.isFinite(t)) continue;
    if (t > latestMs) {
      latestMs = t;
      latestIso = new Date(t).toISOString();
    }
  }
  if (!latestIso) return { has_recent: false, latest_review_date: null };

  const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
  const has_recent = Date.now() - latestMs <= sixtyDaysMs;
  return { has_recent, latest_review_date: latestIso };
}

// ===== Instagram profile lookup (DuckDuckGo HTML) ===========================

// Search-based Instagram presence check — no Meta API needed. We can't
// reliably get follower counts via HTTP, so "active" simply means a profile
// URL was found. Profile URLs only — /p/ post and /reel/ links are ignored.
export async function findInstagramProfile(
  businessName: string,
  city: string,
): Promise<{ url: string | null; active: boolean }> {
  if (!businessName.trim()) return { url: null, active: false };

  const q = encodeURIComponent(
    `site:instagram.com "${businessName}" ${city}`.trim(),
  );
  const res = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${q}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; WebioxBot/1.0)" },
  });
  if (!res || !res.ok) return { url: null, active: false };

  let html: string;
  try {
    html = await res.text();
  } catch {
    return { url: null, active: false };
  }

  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html))) {
    let candidate = m[1];
    try {
      if (candidate.startsWith("/l/?") || candidate.includes("uddg=")) {
        const parsed = new URL(candidate, "https://duckduckgo.com");
        const real = parsed.searchParams.get("uddg");
        if (real) candidate = decodeURIComponent(real);
      }
    } catch {
      // candidate stays as-is
    }
    if (!candidate.startsWith("http")) continue;

    let host = "";
    let path = "";
    try {
      const u = new URL(candidate);
      host = u.hostname.toLowerCase().replace(/^www\./, "");
      path = u.pathname;
    } catch {
      continue;
    }
    if (host !== "instagram.com") continue;

    // /USERNAME — reject post, reel, explore, etc.
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    const first = segments[0].toLowerCase();
    if (
      first === "p" ||
      first === "reel" ||
      first === "reels" ||
      first === "explore" ||
      first === "stories" ||
      first === "tv" ||
      first === "accounts"
    ) {
      continue;
    }
    if (!/^[A-Za-z0-9._]{1,30}$/.test(segments[0])) continue;

    return { url: `https://instagram.com/${segments[0]}`, active: true };
  }

  return { url: null, active: false };
}

// ===== Signal stacking ======================================================

export type SignalScore = {
  has_good_rating: boolean;
  has_review_volume: boolean;
  has_working_phone: boolean;
  not_franchise: boolean;
  has_recent_reviews: boolean;
  running_paid_ads: boolean;
  has_instagram: boolean;
  has_verified_email: boolean;
  confidence: number; // 0-100
  tier: "confirmed" | "probable" | "weak";
  reasoning: string[];
  instagram_url: string | null;
  latest_review_date: string | null;
};

export type StackSignalsOpts = {
  raw: PlacesRaw;
  city: string;
  vertical: string;
  excludeFranchises: boolean;
  minReviews: number;
  minRating: number;
};

// Runs all 8 checks against a Google Places result and returns a weighted
// 0-100 confidence score plus a tier. Franchise leads short-circuit early
// (we don't waste API calls on rejects). Network failures inside individual
// checks degrade to `false` for that signal rather than aborting the stack.
export async function stackSignals(
  opts: StackSignalsOpts,
): Promise<SignalScore> {
  const { raw, city, excludeFranchises, minReviews, minRating } = opts;
  const reasoning: string[] = [];

  // 1. Rating
  const has_good_rating = (raw.rating ?? 0) >= minRating;
  if (has_good_rating) reasoning.push(`${raw.rating}★ rating ✓`);

  // 2. Review volume
  const has_review_volume = (raw.userRatingCount ?? 0) >= minReviews;
  if (has_review_volume) reasoning.push(`${raw.userRatingCount} reviews ✓`);

  // 3. Phone
  const has_working_phone = !!(
    raw.internationalPhoneNumber || raw.nationalPhoneNumber
  );
  if (has_working_phone) reasoning.push("Phone available ✓");

  // 4. Not franchise
  const name = raw.displayName?.text ?? "";
  const not_franchise = !excludeFranchises || !isFranchiseDealer(name);
  if (not_franchise) reasoning.push("Independent business ✓");
  else reasoning.push("FRANCHISE — skipping");

  // Early exit for franchises — saves Details API + DDG quota on rejects.
  if (!not_franchise) {
    return {
      has_good_rating,
      has_review_volume,
      has_working_phone,
      not_franchise,
      has_recent_reviews: false,
      running_paid_ads: false,
      has_instagram: false,
      has_verified_email: false,
      confidence: 0,
      tier: "weak",
      reasoning,
      instagram_url: null,
      latest_review_date: null,
    };
  }

  // 5. Recent reviews
  const recentCheck = raw.id
    ? await checkRecentReviews(raw.id)
    : { has_recent: false, latest_review_date: null };
  const has_recent_reviews = recentCheck.has_recent;
  if (has_recent_reviews)
    reasoning.push("Reviews in last 60 days ✓ (active business)");

  // 6. Paid ads
  const running_paid_ads = await checkRunningFacebookAds(name, city);
  if (running_paid_ads)
    reasoning.push("Running paid ads ✓ (budget signal 🔥)");

  // 7. Instagram
  const ig = await findInstagramProfile(name, city);
  const has_instagram = ig.active;
  if (has_instagram) reasoning.push("Active on Instagram ✓");

  // 8. Email verified via Hunter — only attempted if the place has a website.
  // Missing HUNTER_API_KEY → silently degrades to false.
  let has_verified_email = false;
  if (raw.websiteUri) {
    const domain = extractDomain(raw.websiteUri);
    if (domain) {
      const emails = await findEmailsForDomain(domain, 1);
      if (emails.length > 0) {
        has_verified_email = true;
        reasoning.push("Email found via Hunter ✓");
      }
    }
  }

  // Weighted confidence — paid_ads is the strongest single signal, review
  // volume next, then everything else in the 10-15 band.
  let confidence = 0;
  if (has_good_rating) confidence += 10;
  if (has_review_volume) confidence += 15;
  if (has_working_phone) confidence += 10;
  if (not_franchise) confidence += 10;
  if (has_recent_reviews) confidence += 15;
  if (running_paid_ads) confidence += 20;
  if (has_instagram) confidence += 10;
  if (has_verified_email) confidence += 10;

  const tier: SignalScore["tier"] =
    confidence >= 75 ? "confirmed" : confidence >= 50 ? "probable" : "weak";

  return {
    has_good_rating,
    has_review_volume,
    has_working_phone,
    not_franchise,
    has_recent_reviews,
    running_paid_ads,
    has_instagram,
    has_verified_email,
    confidence,
    tier,
    reasoning,
    instagram_url: ig.url,
    latest_review_date: recentCheck.latest_review_date,
  };
}

// ===== Solution detection ===================================================

// Step 14 — classify each lead into one of four solution buckets so the user's
// `target_solutions` setting can filter the scout's output. Distinct from
// `recommended_solution` (DB enum: website/mobile_app/crm/automation/multi/none) —
// callers map `custom_software` → `crm` when inserting into Postgres.
export type DetectedSolution =
  | "website"
  | "custom_software"
  | "automation"
  | "multi";

export function detectSolutionForLead(opts: {
  raw: PlacesRaw;
  signals: SignalScore;
  vertical: string;
}): DetectedSolution {
  const { raw, signals } = opts;
  const hasWebsite = !!raw.websiteUri;
  const reviews = raw.userRatingCount ?? 0;

  // No website → pure new-build pitch.
  if (!hasWebsite) return "website";

  // High-volume business → needs internal management software.
  if (reviews >= 500) return "custom_software";

  // Already spending on ads at mid-volume → automate the funnel before that
  // ad spend leaks any further.
  if (signals.running_paid_ads && reviews < 500) return "automation";

  // Default = multi (best for upselling; pitch both).
  return "multi";
}

// ===== Lead scoring ==========================================================

export type ScoreInput = {
  raw: PlacesRaw;
  hasWebsite: boolean;
  runningAds: boolean;
  hasMultipleLocations: boolean;
  vertical?: string;
};

// Score a lead 0-100 from its detected signals. Heavily biased toward
// NO-WEBSITE leads (easy pitch) and pre-owned keyword matches (independent).
export function scoreLead(input: ScoreInput): {
  score: number;
  reasoning: string;
} {
  const { raw, hasWebsite, runningAds, hasMultipleLocations } = input;
  const name = (raw.displayName?.text ?? "").toLowerCase();
  const rating = raw.rating ?? 0;
  const reviews = raw.userRatingCount ?? 0;

  const reasons: string[] = [];
  let score = 0;

  // 1. NO-WEBSITE bonus (biggest factor — easy pitch for the user)
  if (!hasWebsite) {
    score += 35;
    reasons.push("🔥 NO WEBSITE (easy pitch)");
  } else {
    score += 10;
    reasons.push("Has website (refresh/upsell pitch)");
  }

  // 2. Pre-owned keyword bonus (signals independent dealer)
  if (/(pre.?owned|used|second.?hand|exchange)/i.test(name)) {
    score += 20;
    reasons.push('"pre-owned/used" in name (verified independent)');
  }

  // 3. Premium signal (rating × log(reviews))
  const premiumScore = Math.min(
    20,
    Math.round(rating * Math.log10(reviews + 1) * 1.0),
  );
  score += premiumScore;
  reasons.push(`${rating}★ × ${reviews} reviews (+${premiumScore})`);

  // 4. Running ads
  if (runningAds) {
    score += 15;
    reasons.push("Running paid ads (budget signal)");
  }

  // 5. Multi-location
  if (hasMultipleLocations) {
    score += 5;
    reasons.push("Multi-location brand");
  }

  // 6. Phone available
  if (raw.internationalPhoneNumber || raw.nationalPhoneNumber) {
    score += 5;
    reasons.push("Reachable by phone");
  }

  return {
    score: Math.min(100, score),
    reasoning: reasons.join(" • "),
  };
}

// ===== Call script generator =================================================

export type CallScriptLead = {
  name: string;
  contactName?: string;
  city: string;
  vertical: string;
  reasoning: string;
  has_website: boolean;
  running_ads: boolean;
  has_instagram?: boolean;
  rating?: number | null;
  reviews?: number | null;
};

// Template-based 30-second cold-call script in THREE languages:
// Hinglish, English, and Gujarati. From Step 13 onward, the pitch always
// presents BOTH the website work and custom business software (CRM / inventory
// / customer DB) as parts of one Webiox package — never one OR the other —
// with sadgurucarsurat.com as the bundled case study.
export function buildCallScript(
  lead: CallScriptLead,
  caseStudyUrl = "sadgurucarsurat.com",
): { hinglish: string; english: string; gujarati: string } {
  const rating = lead.rating ?? 0;
  const reviews = lead.reviews ?? 0;
  const reviewsStr = reviews ? reviews.toLocaleString("en-IN") : "kai saare";
  const greet = "Sir";

  // Build the "why I'm calling" hook — calls out the strongest signals.
  const igLineH = lead.has_instagram
    ? " Instagram pe bhi active ho — achha sign hai."
    : "";
  const igLineE = lead.has_instagram
    ? " You're also active on Instagram — good sign."
    : "";
  const igLineG = lead.has_instagram
    ? " Instagram પર પણ active છો — સારી નિશાની."
    : "";

  const siteLineH = lead.has_website
    ? "Aapki website bhi dekhi."
    : "Lekin online search karne pe website nahi mili.";
  const siteLineE = lead.has_website
    ? "I checked your website too."
    : "But there's no website online for the business.";
  const siteLineG = lead.has_website
    ? "Website પણ જોઈ."
    : "પણ online website નથી મળી.";

  const hookHinglish =
    `Aapka ${lead.name} ${lead.city} mein ${reviewsStr} reviews aur ${rating}★ rating dekha — bahut achha business hai.${igLineH} ${siteLineH}`;
  const hookEnglish =
    `${greet}, I came across ${lead.name} — ${reviewsStr} reviews and ${rating}★ rating in ${lead.city}, strong business.${igLineE} ${siteLineE}`;
  const hookGujarati =
    `${greet}, ${lead.name} ${lead.city} માં ${reviewsStr} reviews અને ${rating}★ rating જોઈ — સારું business છે.${igLineG} ${siteLineG}`;

  // Dual offering — two parallel pillars, not an either/or.
  const websiteLabelH = lead.has_website
    ? "Premium business website refresh + SEO"
    : "Premium business website (fresh build) + SEO";
  const websiteLabelE = lead.has_website
    ? "Premium business website refresh + SEO"
    : "Premium business website (fresh build) + SEO";
  const websiteLabelG = lead.has_website
    ? "Premium business website refresh + SEO"
    : "Premium business website (નવી) + SEO";

  const offeringHinglish =
    `Hum 2 kaam karte hain Webiox mein:\n` +
    `1. ${websiteLabelH}\n` +
    `2. Custom business software / CRM — leads, inventory, customer database manage karne ke liye`;
  const offeringEnglish =
    `At Webiox we do two things:\n` +
    `1. ${websiteLabelE}\n` +
    `2. Custom business software / CRM — to manage leads, inventory and your customer database`;
  const offeringGujarati =
    `Webiox માં અમે 2 કામ કરીએ છીએ:\n` +
    `1. ${websiteLabelG}\n` +
    `2. Custom business software / CRM — leads, inventory અને customer database manage કરવા માટે`;

  // Case study — Sadguru Cars Surat for car dealers, generic Surat business
  // otherwise. Either way it's a dual-deliverable case study now.
  const caseStudyHinglish =
    lead.vertical === "car_dealer"
      ? `Sadguru Cars Surat ke liye recently dono kaam kiya — ${caseStudyUrl} par dekh sakte ho. Unke WhatsApp leads 3x ho gaye aur internal management bhi smooth ho gaya.`
      : `Recently ek Surat business ke liye dono kaam kiya — ${caseStudyUrl} par dekh sakte ho. WhatsApp leads 3x ho gaye aur internal management bhi smooth ho gaya.`;
  const caseStudyEnglish =
    lead.vertical === "car_dealer"
      ? `We recently shipped both for Sadguru Cars Surat — you can see it at ${caseStudyUrl}. Their WhatsApp inquiries 3x'd and their internal ops got a lot smoother.`
      : `We recently shipped both for a Surat business — you can see it at ${caseStudyUrl}. Their WhatsApp leads 3x'd and their internal ops became much smoother.`;
  const caseStudyGujarati =
    lead.vertical === "car_dealer"
      ? `તાજેતરમાં Sadguru Cars Surat માટે બંને કામ કર્યા — ${caseStudyUrl} પર જોઈ શકો. એમના WhatsApp leads 3x થઈ ગયા અને internal management પણ smooth થઈ ગયું.`
      : `તાજેતરમાં એક Surat business માટે બંને કામ કર્યા — ${caseStudyUrl} પર જોઈ શકો. WhatsApp leads 3x થઈ ગયા અને internal management પણ smooth થઈ ગયું.`;

  const askHinglish =
    "Aapke business ke liye dono mein se kya zyada relevant lagta hai, ya dono?\n\n10 minute baat kar sakte hain?";
  const askEnglish =
    "Which of the two feels more relevant for your business — or both?\n\nGot 10 minutes for a quick call?";
  const askGujarati =
    "તમારા business માટે બંને માંથી શું વધારે relevant લાગે છે, કે બંને?\n\n10 minute વાત કરી શકીએ?";

  return {
    hinglish: `Namaste ${greet},\nMain Manthan from Webiox, Ahmedabad.\n\n${hookHinglish}\n\n${offeringHinglish}\n\n${caseStudyHinglish}\n\n${askHinglish}\n\n— Manthan, Webiox`,
    english: `Hi ${greet},\nI'm Manthan from Webiox, Ahmedabad.\n\n${hookEnglish}\n\n${offeringEnglish}\n\n${caseStudyEnglish}\n\n${askEnglish}\n\n— Manthan, Webiox`,
    gujarati: `નમસ્તે ${greet},\nહું Manthan, Webiox થી, Ahmedabad માં.\n\n${hookGujarati}\n\n${offeringGujarati}\n\n${caseStudyGujarati}\n\n${askGujarati}\n\n— Manthan, Webiox`,
  };
}
