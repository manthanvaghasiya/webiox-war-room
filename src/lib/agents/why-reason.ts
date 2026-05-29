// Step 14 — single-sentence "why this lead is hot" reason, shown in the WHY
// column of the leads table. Calls Claude Haiku 4.5 (cheapest) with a tight
// 100-token cap; degrades to a template if the API key is missing or the call
// fails.

import { GoogleGenerativeAI } from "@google/generative-ai";

import type { DetectedSolution } from "./google-places-helpers";

export type WhyReasonOpts = {
  business_name: string;
  city: string;
  rating: number;
  reviews: number;
  has_website: boolean;
  running_ads: boolean;
  has_instagram: boolean;
  solution: DetectedSolution;
  vertical_label: string;
};

export async function generateWhyReason(opts: WhyReasonOpts): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { maxOutputTokens: 100 },
      });

      const prompt = `Write ONE short sentence (max 25 words) explaining why this business needs Webiox.

Business: ${opts.business_name} (${opts.vertical_label} in ${opts.city})
Signals: ${opts.rating}★ from ${opts.reviews} reviews. ${opts.has_website ? "Has website." : "NO WEBSITE."} ${opts.running_ads ? "Runs paid ads." : ""} ${opts.has_instagram ? "Active on Instagram." : ""}
Recommended solution: ${opts.solution}

Webiox builds: business websites + custom CRM software + automation workflows.

Write the sentence as if explaining to a salesperson WHY this lead is hot. Examples:
- "No working website — Webiox can ship a modern, mobile-first site that converts walk-ins into bookings."
- "1,400+ reviews but managing leads on Excel — perfect CRM upgrade opportunity."
- "Running paid ads but no automation — ad spend leaking, automation will 2x ROI."

Only return the sentence, no preamble.`;

      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text && text.length > 10) return text;
    } catch {
      // fall through to template
    }
  }

  return templateWhyReason(opts);
}

function templateWhyReason(opts: WhyReasonOpts): string {
  if (!opts.has_website) {
    return "No working website — Webiox can ship a modern, mobile-first site that converts walk-ins into customers.";
  }
  if (opts.reviews >= 500) {
    return `${opts.reviews}+ reviews but likely managing leads manually — perfect custom CRM opportunity.`;
  }
  if (opts.running_ads) {
    return "Running paid ads but no funnel automation — ad spend leaking, Webiox automation will 2x ROI.";
  }
  return `Established business in ${opts.city} ready for digital upgrade — Webiox can deliver website + CRM as one package.`;
}
