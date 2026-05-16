import type { Lead, LeadLanguage } from "@/types/database";

type LocaleLead = Pick<Lead, "segment" | "location" | "address">;

const GUJARAT_CITIES = [
  "gujarat",
  "ahmedabad",
  "surat",
  "vadodara",
  "rajkot",
  "bhavnagar",
  "jamnagar",
  "gandhinagar",
];

// Picks the outreach language: English for b2b_global, Gujarati for any India
// lead located in Gujarat, Hinglish for the rest of India.
export function detectLanguageForLead(
  lead: LocaleLead,
): Extract<LeadLanguage, "english" | "hinglish" | "gujarati"> {
  if (lead.segment === "b2b_global") return "english";

  const locationBlob = `${lead.location ?? ""} ${lead.address ?? ""}`.toLowerCase();
  if (GUJARAT_CITIES.some((city) => locationBlob.includes(city))) {
    return "gujarati";
  }
  return "hinglish";
}
