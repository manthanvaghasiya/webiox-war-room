import type { Lead, SolutionType } from "@/types/database";

// Outreach message templates — solution × segment × language. No API calls;
// pure string substitution. Gujarati strings are literal UTF-8 Gujarati script.

export type PersonalizedMessage = { subject: string; body: string };

// Fields the templates read.
type TemplateLead = Pick<
  Lead,
  | "first_name"
  | "company"
  | "industry"
  | "recommended_solution"
  | "segment"
>;

type TemplateKey = "website" | "mobile_app" | "crm" | "automation" | "multi";

function normalizeSolution(s: SolutionType | null | undefined): TemplateKey {
  if (s === "website" || s === "mobile_app" || s === "crm" || s === "automation") {
    return s;
  }
  return "multi"; // 'none'/null/unknown all fall back to the multi pitch
}

// Replace {token} placeholders. Unknown tokens are left untouched.
function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_m, key: string) =>
    key in vars ? vars[key] : `{${key}}`,
  );
}

function vars(
  lead: TemplateLead,
  agency: string,
  senderName: string,
): Record<string, string> {
  return {
    firstName: lead.first_name || "there",
    company: lead.company || "your business",
    industry: lead.industry || "your space",
    agency,
    senderName,
  };
}

// ---------------------------------------------------------------------------
// B2B Global — English, email-style
// ---------------------------------------------------------------------------

const B2B_SUBJECTS: Record<TemplateKey, string> = {
  website: "Quick thought on {company}'s online presence",
  mobile_app: "App opportunity for {company}",
  crm: "Idea for {company}'s client tracking",
  automation: "Automation idea for {company}",
  multi: "Quick thought on {company}",
};

const B2B_BODIES: Record<TemplateKey, string> = {
  website: `Hi {firstName},

Came across {company} while researching {industry} brands. Your story is compelling — but the digital storefront isn't doing it justice.

We help companies like {company} ship modern, conversion-focused websites in 3-4 weeks. No bloat, no months of redesign cycles.

Worth a 15-min chat to see if there's a fit? Pricing is affordable — happy to share details on a call.

— {senderName}
{agency}`,
  mobile_app: `Hi {firstName},

{company} stood out — your customer base looks like it would convert beautifully to a native app experience (repeat purchase loop, push notifications, offline mode).

We build production iOS + Android apps in 6-8 weeks, designed-first. Open to a quick call to walk you through what's possible?

— {senderName}
{agency}`,
  crm: `Hi {firstName},

Working in {industry}, you're probably handling a high volume of client conversations across email, phone, and follow-ups. A custom CRM that fits how you actually work — not a generic one you bend to — can change the game.

We've built tailored CRMs for {industry} companies. Worth 15 min to see if it makes sense?

— {senderName}
{agency}`,
  automation: `Hi {firstName},

I noticed {company} is in growth mode — and the playbook at your stage usually involves a lot of manual ops work that quietly costs days every week.

We build custom automation workflows (lead pipeline, reporting, onboarding) that scale without adding headcount. Affordable, fast to ship.

Open to a quick call?

— {senderName}
{agency}`,
  multi: `Hi {firstName},

{company} is at a stage where a few right systems unlock real leverage — site, internal tools, automation working together rather than in silos.

We design that whole stack as one project. Curious if you'd want to explore?

— {senderName}
{agency}`,
};

function b2bTemplate(
  lead: TemplateLead,
  agency: string,
  senderName: string,
): PersonalizedMessage {
  const key = normalizeSolution(lead.recommended_solution);
  const v = vars(lead, agency, senderName);
  return {
    subject: fill(B2B_SUBJECTS[key], v),
    body: fill(B2B_BODIES[key], v),
  };
}

// ---------------------------------------------------------------------------
// Local India — Hinglish (default for non-Gujarat)
// ---------------------------------------------------------------------------

const HINGLISH_BODIES: Record<TemplateKey, string> = {
  website: `Namaste {firstName} ji,

Aapka {company} ka kaam dekha — bahut achha hai. Lekin online presence kahin nahi dikh raha. Customer aapko Google par dhundh nahi paa raha.

Hum {agency} se hain — affordable websites banate hain jo aapke business ko online laate hain. Pricing baad mein discuss karenge, pehle ek call par baat kar sakte hain?

Reply kijiye ya call kijiye — {senderName}`,
  mobile_app: `Namaste {firstName} ji,

{company} jaise business ke liye mobile app bahut zaroor hai — booking, customer reminders, repeat orders sab ek jagah. Aaj kal sab WhatsApp pe karte hain, par app se professional impression banta hai.

Hum {agency} se hain — Android + iOS app banate hain affordable price mein. Ek 10-min call pe discuss kar sakte hain?

— {senderName}`,
  crm: `Namaste {firstName} ji,

{company} mein patient/client records manage karna mushkil hota hoga — paper register, Excel, WhatsApp sab jagah. Ek proper CRM se sab ek jagah aa jata hai, follow-ups automatic ho jate hain.

{agency} ne aisa system aapke jaise businesses ke liye banaya hai. Affordable hai — ek call par discuss karein?

— {senderName}`,
  automation: `Namaste {firstName} ji,

{company} chalana mein bahut sara manual kaam hota hoga — WhatsApp pe orders, follow-up reminders, invoice. Yeh sab automate ho sakta hai.

{agency} se hum aisa setup karte hain ki aapka business 24/7 chalta rahe — bina extra staff ke. Affordable price. Ek baar baat kar lein?

— {senderName}`,
  multi: `Namaste {firstName} ji,

{company} ke liye website + booking app + WhatsApp automation — sab ek saath setup ho sakta hai. Customers aapko Google pe dhundh sakte hain, online order de sakte hain, aur reminders bhi mil jate hain.

{agency} se hum yeh complete package banate hain — affordable hai. Ek call par sab dikhata hoon?

— {senderName}`,
};

// ---------------------------------------------------------------------------
// Local India — Gujarati script (for Gujarat businesses)
// ---------------------------------------------------------------------------

const GUJARATI_BODIES: Record<TemplateKey, string> = {
  website: `નમસ્તે {firstName} ભાઈ/બેન,

તમારું {company} નું કામ જોયું — ખૂબ સરસ છે. પણ ઓનલાઈન ક્યાંય દેખાતું નથી. ગ્રાહક Google પર શોધે તો મળતું નથી.

અમે {agency} માંથી છીએ — affordable website બનાવીએ છીએ જે તમારા બિઝનેસને ઓનલાઈન લાવે. Pricing પછી discuss કરીશું, પહેલા એક call પર વાત કરી શકીએ?

Reply કરો અથવા call કરો — {senderName}`,
  mobile_app: `નમસ્તે {firstName} ભાઈ/બેન,

{company} જેવા બિઝનેસ માટે mobile app ખૂબ જરૂરી છે — booking, customer reminders, repeat orders બધું એક જગ્યાએ. અત્યારે બધા WhatsApp પર કરે છે, પણ app થી professional impression પડે છે.

અમે {agency} માંથી છીએ — Android + iOS app બનાવીએ છીએ affordable price માં. એક 10-min call પર discuss કરી શકીએ?

— {senderName}`,
  crm: `નમસ્તે {firstName} ભાઈ/બેન,

{company} માં patient/client records manage કરવા મુશ્કેલ છે — paper register, Excel, WhatsApp બધે છૂટુંછવાયું. એક proper CRM થી બધું એક જગ્યાએ આવી જાય, follow-ups automatic થઈ જાય.

{agency} એ આવી system તમારા જેવા businesses માટે બનાવી છે. Affordable છે — એક call પર discuss કરીએ?

— {senderName}`,
  automation: `નમસ્તે {firstName} ભાઈ/બેન,

{company} ચલાવવામાં બહુ સારું manual કામ હોય છે — WhatsApp પર orders, follow-up reminders, invoice. આ બધું automate થઈ શકે.

{agency} માંથી અમે એવી setup કરીએ છીએ કે તમારો બિઝનેસ 24/7 ચાલે — extra staff વગર. Affordable price. એક વાર વાત કરીએ?

— {senderName}`,
  multi: `નમસ્તે {firstName} ભાઈ/બેન,

{company} માટે website + booking app + WhatsApp automation — બધું એક સાથે setup થઈ શકે. ગ્રાહકો તમને Google પર શોધી શકે, online order આપી શકે, અને reminders પણ મળે.

{agency} માંથી અમે આ complete package બનાવીએ છીએ — affordable છે. એક call પર બધું બતાવું?

— {senderName}`,
};

// ---------------------------------------------------------------------------
// Public builders
// ---------------------------------------------------------------------------

// Hinglish body for a lead (Localizer uses this for non-Gujarat India leads).
export function buildHinglishMessage(
  lead: TemplateLead,
  agency: string,
  senderName: string,
  solution: SolutionType | null,
): string {
  return fill(
    HINGLISH_BODIES[normalizeSolution(solution)],
    vars(lead, agency, senderName),
  );
}

// Gujarati body for a lead (Localizer uses this for Gujarat leads).
export function buildGujaratiMessage(
  lead: TemplateLead,
  agency: string,
  senderName: string,
  solution: SolutionType | null,
): string {
  return fill(
    GUJARATI_BODIES[normalizeSolution(solution)],
    vars(lead, agency, senderName),
  );
}

// Primary entry — English for b2b_global, Hinglish baseline for local India
// (the Localizer upgrades Gujarat leads to Gujarati afterward).
export function buildPersonalizedMessage(
  lead: TemplateLead,
  agencyName = "Webiox",
  senderName = "The team",
): PersonalizedMessage {
  if (lead.segment === "b2b_global") {
    return b2bTemplate(lead, agencyName, senderName);
  }
  return {
    subject: "",
    body: buildHinglishMessage(
      lead,
      agencyName,
      senderName,
      lead.recommended_solution,
    ),
  };
}
