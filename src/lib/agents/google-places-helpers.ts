// Google Places API (New) + Facebook Ad Library helpers — powers the real
// Lead Scout (Step 11). Every export is defensive: network calls never throw,
// they degrade to empty/false so a single bad city or business can't abort a
// scout run. All outbound calls carry an 8s AbortController timeout.
//
// The GOOGLE_PLACES_API_KEY is read here and ONLY here — it is passed straight
// into a request header and never logged. Callers should never touch the key.

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
  rating?: number | null;
  reviews?: number | null;
};

// Template-based 30-second cold-call script in THREE languages:
// Hinglish, English, and Gujarati — with sadgurucarsurat.com as the
// car_dealer vertical case study.
export function buildCallScript(
  lead: CallScriptLead,
  caseStudyUrl = "sadgurucarsurat.com",
): { hinglish: string; english: string; gujarati: string } {
  const rating = lead.rating ?? 0;
  const reviews = lead.reviews ?? 0;
  const reviewsStr = reviews ? reviews.toLocaleString("en-IN") : "kai saare";
  const greet = "Sir";

  // Build the "why I'm calling" hook
  let hookHinglish = "";
  let hookEnglish = "";
  let hookGujarati = "";

  if (!lead.has_website && lead.vertical === "car_dealer") {
    hookHinglish =
      `Aapka ${lead.name} ${lead.city} mein ${reviewsStr} reviews aur ${rating}★ rating dekha — bahut achha business hai. ` +
      `Lekin online search karne pe website nahi mili. Aaj kal customer pehle Google pe search karta hai car dekhne ke liye — agar website nahi to vo competitor pe chala jata hai.`;
    hookEnglish =
      `${greet}, I noticed ${lead.name} has ${reviewsStr} reviews and ${rating}★ rating in ${lead.city} — strong business. ` +
      `But there's no website online, and most customers search Google first before visiting a dealership.`;
    hookGujarati =
      `${greet}, ${lead.name} ${lead.city} માં ${reviewsStr} reviews અને ${rating}★ rating જોઈ — સારું business છે. ` +
      `પણ online website નથી. અત્યારે customer પહેલા Google પર search કરે છે — website ના હોવાથી competitor પાસે જતો રહે છે.`;
  } else if (lead.has_website && lead.vertical === "car_dealer") {
    hookHinglish =
      `Aapka ${lead.name} ${lead.city} mein ${reviewsStr} reviews aur ${rating}★ rating dekha — strong business. ` +
      `Aapki website bhi dekhi — kuch improvements ho sakte hain jisse ${lead.running_ads ? "aapke ad ka ROI 2-3x ho jaye" : "leads zyada aaye"}.`;
    hookEnglish =
      `${greet}, I checked ${lead.name} — ${reviewsStr} reviews, ${rating}★. Looked at your website — there are some quick wins that can ` +
      `${lead.running_ads ? "2-3x your ad ROI" : "bring more inquiries"}.`;
    hookGujarati =
      `${greet}, ${lead.name} ${reviewsStr} reviews, ${rating}★ rating જોયું. Website પણ check કરી — થોડા improvements થી ` +
      `${lead.running_ads ? "ad નો ROI 2-3x" : "વધારે leads"} મળી શકે છે.`;
  } else {
    // generic for other verticals
    hookHinglish = `Aapka ${lead.name} ${lead.city} mein ${reviewsStr} reviews aur ${rating}★ rating dekha — bahut achha business hai.`;
    hookEnglish = `${greet}, I came across ${lead.name} — ${reviewsStr} reviews, ${rating}★ in ${lead.city}. Strong business.`;
    hookGujarati = `${greet}, ${lead.name} ${lead.city} માં ${reviewsStr} reviews અને ${rating}★ rating જોઈ. સારું business છે.`;
  }

  const caseStudyLine =
    lead.vertical === "car_dealer"
      ? `Recently main ne ${caseStudyUrl} banaya for ek Surat dealer — unke WhatsApp leads 3x ho gaye, online se customer aane lage. Same approach aap ke liye bhi work karega.`
      : `Recently humne ${caseStudyUrl} banaya ek Surat ke business ke liye — abhi unke paas WhatsApp leads 3x ho gaye hain. Same approach aap ke liye bhi work karega.`;
  const caseStudyLineEnglish =
    lead.vertical === "car_dealer"
      ? `I recently built ${caseStudyUrl} for a Surat dealer — their WhatsApp inquiries 3x'd within 60 days. Same playbook applies to you.`
      : `We recently built ${caseStudyUrl} for a Surat business — their WhatsApp leads have since tripled. The same approach would work well for you.`;
  const caseStudyLineGujarati =
    lead.vertical === "car_dealer"
      ? `તાજેતરમાં મેં ${caseStudyUrl} બનાવી એક Surat dealer માટે — એમના WhatsApp leads 3x થઈ ગયા. એ જ approach તમારા માટે પણ કામ કરશે.`
      : `તાજેતરમાં અમે ${caseStudyUrl} બનાવી — એમના WhatsApp leads 3x થઈ ગયા. એ જ approach તમારા માટે પણ કામ કરશે.`;

  const closeHinglish =
    "5 minute ka time hai? Main aapko ek quick example bhej deta hoon WhatsApp pe.";
  const closeEnglish =
    "Got 5 minutes? I'll send a quick example on WhatsApp.";
  const closeGujarati =
    "5 minute નો time છે? હું તમને WhatsApp પર એક quick example મોકલીશ.";

  return {
    hinglish: `Namaste ${greet},\n\nMain Manthan bol raha hoon Webiox se, Ahmedabad mein.\n\n${hookHinglish}\n\n${caseStudyLine}\n\n${closeHinglish}\n\n— Manthan, Webiox`,
    english: `Hi ${greet},\n\nI'm Manthan from Webiox, Ahmedabad.\n\n${hookEnglish}\n\n${caseStudyLineEnglish}\n\n${closeEnglish}\n\n— Manthan, Webiox`,
    gujarati: `નમસ્તે ${greet},\n\nહું Manthan, Webiox થી, Ahmedabad માં.\n\n${hookGujarati}\n\n${caseStudyLineGujarati}\n\n${closeGujarati}\n\n— Manthan, Webiox`,
  };
}
