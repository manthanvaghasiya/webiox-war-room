import type { Lead, SolutionType } from "@/types/database";

const USER_AGENT = "Mozilla/5.0 (compatible; WebioxBot/1.0)";
const FETCH_TIMEOUT_MS = 5000;

const AGGREGATOR_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "justdial.com",
  "sulekha.com",
  "indiamart.com",
  "zomato.com",
];

function fetchWithTimeout(url: string, init?: RequestInit) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  return fetch(url, {
    ...init,
    signal: ctrl.signal,
    headers: { "User-Agent": USER_AGENT, ...(init?.headers ?? {}) },
  }).finally(() => clearTimeout(t));
}

// ---------------------------------------------------------------------------
// 1. verifyEmailWithHunter
// ---------------------------------------------------------------------------

export type EmailVerification = {
  verified: boolean;
  score: number;
  reason: string;
};

export async function verifyEmailWithHunter(
  email: string,
): Promise<EmailVerification | null> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(
      email,
    )}&api_key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { status?: string; score?: number };
    };
    const status = json.data?.status ?? "unknown";
    return {
      verified: status === "valid",
      score: Number(json.data?.score ?? 0),
      reason: status,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 2. findEmailsForDomain
// ---------------------------------------------------------------------------

export type DomainEmail = {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
};

export async function findEmailsForDomain(
  domain: string,
  limit = 3,
): Promise<DomainEmail[]> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return [];
  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(
      domain,
    )}&limit=${limit}&api_key=${encodeURIComponent(key)}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const json = (await res.json()) as {
      data?: {
        emails?: Array<{
          value?: string;
          first_name?: string;
          last_name?: string;
          position?: string;
        }>;
      };
    };
    return (json.data?.emails ?? []).map((e) => ({
      email: e.value ?? "",
      first_name: e.first_name ?? "",
      last_name: e.last_name ?? "",
      position: e.position ?? "",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. findLocalBusinessWebsite — DuckDuckGo HTML scrape
// ---------------------------------------------------------------------------

function extractHost(rawUrl: string): string | null {
  try {
    return new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isAggregator(host: string): boolean {
  return AGGREGATOR_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

export async function findLocalBusinessWebsite(
  businessName: string,
  city: string,
): Promise<string | null> {
  try {
    const q = encodeURIComponent(`${businessName} ${city} website`);
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const html = await res.text();

    // DuckDuckGo HTML results: anchors with class "result__a" wrap the title +
    // href. Hrefs are often wrapped in a redirect (`/l/?uddg=<encoded>`), so we
    // pull the candidate URL out of either the raw href or the uddg param.
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
      const host = extractHost(candidate);
      if (!host || isAggregator(host)) continue;
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. analyzeWebsite
// ---------------------------------------------------------------------------

export type WebsiteAnalysis = {
  status: "good" | "outdated" | "broken" | "no_website";
  details: string;
  loadMs: number | null;
};

export async function analyzeWebsite(
  url: string | null | undefined,
): Promise<WebsiteAnalysis> {
  if (!url) {
    return {
      status: "no_website",
      details: "No website found online",
      loadMs: null,
    };
  }

  const t0 = Date.now();
  let html = "";
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      return {
        status: "broken",
        details: `Site returned ${res.status}`,
        loadMs: null,
      };
    }
    html = await res.text();
  } catch {
    return {
      status: "broken",
      details: "Site unreachable or returns error",
      loadMs: null,
    };
  }
  const loadMs = Date.now() - t0;

  const hasViewport = /<meta\s+[^>]*name=["']viewport["']/i.test(html);
  const hasTitle = /<title[^>]*>/i.test(html);
  const isHttps = url.startsWith("https://");
  const slow = loadMs > 3000;

  const good = isHttps && hasViewport && !slow;
  const status: WebsiteAnalysis["status"] = good ? "good" : "outdated";

  const httpsTag = isHttps ? "HTTPS ✓" : "HTTP ✗";
  const mobileTag = hasViewport ? "Mobile ✓" : "No mobile";
  const titleTag = hasTitle ? "Title ✓" : "No title";
  const loadTag = slow
    ? `slow load (${(loadMs / 1000).toFixed(1)}s)`
    : `Load ${(loadMs / 1000).toFixed(1)}s`;
  const details = `${httpsTag} ${mobileTag} ${titleTag} ${loadTag}`;

  return { status, details, loadMs };
}

// ---------------------------------------------------------------------------
// 5. simulateEnrichment — for source='demo' leads
// ---------------------------------------------------------------------------

export type SimulatedEnrichment = {
  email_verified: boolean;
  website: string | null;
  website_status: "good" | "outdated" | "broken" | "no_website" | "unchanged";
  research_note: string;
};

export function simulateEnrichment(
  lead: Pick<Lead, "segment" | "email" | "website" | "company">,
): SimulatedEnrichment {
  if (lead.segment === "b2b_global") {
    const verified = Math.random() < 0.8;
    return {
      email_verified: verified,
      website: lead.website ?? null,
      website_status: "unchanged",
      research_note: verified
        ? "[DEMO] Simulated enrichment: email verified via Hunter (mock)."
        : "[DEMO] Simulated enrichment: email could not be verified (mock).",
    };
  }

  // local_india — biased toward Webiox's "your website needs help" pitch.
  const r = Math.random();
  if (r < 0.3) {
    return {
      email_verified: false,
      website: null,
      website_status: "no_website",
      research_note: "[DEMO] Simulated enrichment: no website found online.",
    };
  }
  if (r < 0.7) {
    return {
      email_verified: false,
      website: lead.website ?? `https://example.com/${slugify(lead.company)}`,
      website_status: "outdated",
      research_note:
        "[DEMO] Simulated enrichment: website looks outdated — no mobile viewport, slow load.",
    };
  }
  if (r < 0.95) {
    return {
      email_verified: false,
      website: lead.website ?? `https://example.com/${slugify(lead.company)}`,
      website_status: "broken",
      research_note:
        "[DEMO] Simulated enrichment: website is broken or unreachable.",
    };
  }
  return {
    email_verified: false,
    website: lead.website ?? `https://example.com/${slugify(lead.company)}`,
    website_status: "good",
    research_note: "[DEMO] Simulated enrichment: website looks healthy.",
  };
}

function slugify(s: string | null): string {
  return (s ?? "biz")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  const host = extractHost(url);
  return host || null;
}

export function randomSleep(minMs: number, maxMs: number): Promise<void> {
  const ms = Math.floor(minMs + Math.random() * (maxMs - minMs));
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// 6. Solution decision helpers
// ---------------------------------------------------------------------------

export type SolutionDecision = {
  recommended_solution: SolutionType;
  solution_reason: string;
};

export function decideSolutionForLocal(
  lead: Pick<Lead, "business_category" | "company">,
  websiteStatus: "good" | "outdated" | "broken" | "no_website",
): SolutionDecision {
  const cat = (lead.business_category ?? "").toLowerCase();

  if (websiteStatus === "no_website" || websiteStatus === "broken") {
    return {
      recommended_solution: "website",
      solution_reason: `${lead.company ?? "Business"} has no working website — Webiox can ship a modern, mobile-first site that converts walk-ins into bookings.`,
    };
  }

  const inCat = (...names: string[]) =>
    names.some((n) => cat.includes(n));

  if (
    inCat("restaurant", "salon", "gym", "clinic") &&
    websiteStatus === "outdated"
  ) {
    return {
      recommended_solution: "multi",
      solution_reason: `Site is dated for a ${cat || "service"} business — bundle a rebuild with a booking/loyalty mobile flow for higher repeat-customer LTV.`,
    };
  }

  if (inCat("restaurant")) {
    return {
      recommended_solution: "mobile_app",
      solution_reason:
        "Restaurants win on online ordering + loyalty — a branded ordering app captures direct margin Zomato/Swiggy would skim.",
    };
  }

  if (inCat("clinic", "salon")) {
    return {
      recommended_solution: "crm",
      solution_reason:
        "Appointment + patient/client records flow is the bottleneck — a lightweight CRM with WhatsApp reminders cuts no-shows.",
    };
  }

  if (inCat("gym")) {
    return {
      recommended_solution: "mobile_app",
      solution_reason:
        "Gym retention is driven by class booking + streaks — a member app keeps schedules and milestones in one place.",
    };
  }

  if (inCat("boutique", "retail", "shop")) {
    return {
      recommended_solution: "website",
      solution_reason:
        "Boutique buyers research online before walking in — a catalog site with WhatsApp inquiry shortens the buying loop.",
    };
  }

  return {
    recommended_solution: "multi",
    solution_reason:
      "Category not clearly mapped — pitching a bundled audit + tailored package is the safest agency play.",
  };
}

export function decideSolutionForB2B(
  lead: Pick<Lead, "industry" | "company_size" | "company">,
): SolutionDecision {
  const ind = (lead.industry ?? "").toLowerCase();
  const inInd = (...names: string[]) => names.some((n) => ind.includes(n));
  const size = lead.company_size ?? 0;

  if (inInd("saas", "software")) {
    return {
      recommended_solution: "automation",
      solution_reason:
        "SaaS scale-ups need workflow automation (onboarding, billing, CRM sync) more than another marketing site.",
    };
  }

  if (inInd("e-commerce", "ecommerce", "dtc", "retail")) {
    if (size > 50) {
      return {
        recommended_solution: "mobile_app",
        solution_reason: `${lead.company ?? "Brand"} is past the size where a repeat-buyer app pays for itself — push notifications outperform email at this scale.`,
      };
    }
    return {
      recommended_solution: "website",
      solution_reason:
        "Earlier-stage e-commerce wins by fixing storefront conversion before investing in app channels.",
    };
  }

  if (inInd("real estate", "healthcare", "education")) {
    return {
      recommended_solution: "crm",
      solution_reason:
        "Long-cycle, high-touch verticals — pipeline visibility + nurture automation in a CRM is where revenue leaks.",
    };
  }

  if (inInd("marketing", "agency", "studio")) {
    return {
      recommended_solution: "multi",
      solution_reason:
        "Agencies resell capability — a multi-solution white-label partnership is the highest-LTV pitch.",
    };
  }

  return {
    recommended_solution: "multi",
    solution_reason:
      "Industry isn't a clean match for any single pillar — lead with a discovery + bundled retainer pitch.",
  };
}
