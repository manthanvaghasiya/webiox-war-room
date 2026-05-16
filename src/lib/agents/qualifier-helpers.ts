import type { Lead } from "@/types/database";

// Deterministic, rule-based lead scoring — no API calls, no randomness.
// Same input always produces the same ScoreBreakdown.

export type ScoreBreakdown = {
  solution_clarity: number; // 0-25
  reachability: number; // 0-25
  authority: number; // 0-20
  buying_signal: number; // 0-20
  geographic_fit: number; // 0-10
  total: number; // sum, 0-100
  notes: string[]; // human-readable reasons
};

// Lead fields the scorer actually reads. The qualifier passes full rows, but
// typing the surface keeps the rules honest.
type ScorableLead = Pick<
  Lead,
  | "recommended_solution"
  | "phone"
  | "email"
  | "email_verified"
  | "job_title"
  | "solution_reason"
  | "research_note"
  | "segment"
  | "website"
  | "industry"
  | "location"
  | "address"
>;

const AUTHORITY_TITLES = [
  "ceo",
  "founder",
  "co-founder",
  "owner",
  "president",
  "director",
  "managing",
  "head of",
  "vp",
  "vice president",
  "chief",
];

export function scoreLeadRuleBased(lead: ScorableLead): ScoreBreakdown {
  const notes: string[] = [];

  // 1. SOLUTION CLARITY (0-25)
  let solution_clarity = 0;
  if (lead.recommended_solution === "multi") {
    solution_clarity = 25;
    notes.push("Multi-solution opportunity (+25)");
  } else if (
    lead.recommended_solution &&
    lead.recommended_solution !== "none"
  ) {
    solution_clarity = 20;
    notes.push(`Clear ${lead.recommended_solution} pitch (+20)`);
  } else {
    notes.push("No clear solution identified (+0)");
  }

  // 2. REACHABILITY (0-25)
  let reachability = 0;
  if (lead.phone) {
    reachability += 10;
    notes.push("Has phone (+10)");
  }
  if (lead.email) {
    reachability += 10;
    notes.push("Has email (+10)");
  }
  if (lead.email_verified) {
    reachability += 5;
    notes.push("Email verified (+5)");
  }
  if (reachability === 0) notes.push("No contact method (+0)");

  // 3. AUTHORITY (0-20)
  let authority = 5;
  const title = (lead.job_title ?? "").toLowerCase();
  if (AUTHORITY_TITLES.some((t) => title.includes(t))) {
    authority = 20;
    notes.push(`Decision-maker title "${lead.job_title}" (+20)`);
  } else if (title) {
    notes.push(`Non-decision title "${lead.job_title}" (+5)`);
  } else {
    notes.push("No title info (+5)");
  }

  // 4. BUYING SIGNAL (0-20)
  let buying_signal = 0;
  const reason = (lead.solution_reason ?? "").toLowerCase();
  const note = (lead.research_note ?? "").toLowerCase();
  const blob = `${reason} ${note}`;

  if (lead.segment === "local_india" && !lead.website) {
    buying_signal = 20;
    notes.push("NO WEBSITE — strong buying signal (+20)");
  } else if (
    blob.includes("outdated") ||
    blob.includes("broken") ||
    blob.includes("no mobile")
  ) {
    buying_signal = 15;
    notes.push("Website issues detected (+15)");
  } else if (
    blob.includes("manual") ||
    blob.includes("paper") ||
    blob.includes("excel") ||
    blob.includes("whatsapp manually")
  ) {
    buying_signal = 15;
    notes.push("Manual process signals (+15)");
  } else if (
    (lead.industry ?? "").toLowerCase().match(/saas|software|agency|marketing/)
  ) {
    buying_signal = 10;
    notes.push("Tech-aware industry (+10)");
  } else {
    notes.push("No strong buying signals (+0)");
  }

  // 5. GEOGRAPHIC FIT (0-10)
  let geographic_fit = 5;
  const loc = `${lead.location ?? ""} ${lead.address ?? ""}`.toLowerCase();
  if (
    lead.segment === "local_india" ||
    loc.includes("india") ||
    loc.includes("gujarat")
  ) {
    geographic_fit = 10;
    notes.push("India-based — local advantage (+10)");
  } else if (
    loc.match(/usa|united states|\bus\b|uk|united kingdom|canada|australia|singapore/)
  ) {
    geographic_fit = 7;
    notes.push("Tier-1 English market (+7)");
  } else {
    notes.push("Reachable but lower priority geo (+5)");
  }

  const total =
    solution_clarity +
    reachability +
    authority +
    buying_signal +
    geographic_fit;

  return {
    solution_clarity,
    reachability,
    authority,
    buying_signal,
    geographic_fit,
    total,
    notes,
  };
}

// Compact one-line reason for the UI.
export function buildScoreReason(b: ScoreBreakdown): string {
  return `${b.total}/100 — ${b.notes.slice(0, 3).join(" • ")}`;
}

// Hard-coded threshold for now; configurable later via settings.
export const PIPELINE_READY_THRESHOLD = 70;

export function isPipelineReady(score: number): boolean {
  return score >= PIPELINE_READY_THRESHOLD;
}
