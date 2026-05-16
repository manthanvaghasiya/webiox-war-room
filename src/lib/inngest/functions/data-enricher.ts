import { dataEnricherEvent, inngest } from "../client";
import { runAgent } from "@/lib/agents/runner";
import {
  analyzeWebsite,
  decideSolutionForB2B,
  decideSolutionForLocal,
  extractDomain,
  findEmailsForDomain,
  findLocalBusinessWebsite,
  randomSleep,
  simulateEnrichment,
  verifyEmailWithHunter,
} from "@/lib/agents/enricher-helpers";
import type { Lead } from "@/types/database";

const MAX_LEADS_PER_RUN = 50;

type EnrichmentLead = Pick<
  Lead,
  | "id"
  | "first_name"
  | "last_name"
  | "full_name"
  | "company"
  | "email"
  | "email_verified"
  | "website"
  | "segment"
  | "source"
  | "location"
  | "status"
  | "research_note"
  | "industry"
  | "company_size"
  | "business_category"
  | "recommended_solution"
  | "solution_reason"
>;

export const dataEnricherFn = inngest.createFunction(
  {
    id: "data-enricher",
    name: "Data Enricher",
    retries: 2,
    triggers: [{ event: dataEnricherEvent }],
  },
  async ({ event, step }) => {
    const userId = event.data.user_id;
    const leadIds = event.data.lead_ids;

    return await runAgent(
      "data_enricher",
      userId,
      "Verify & enrich leads",
      async (ctx) => {
        // ---- fetch candidate leads --------------------------------------
        let query = ctx.supabase
          .from("leads")
          .select(
            "id,first_name,last_name,full_name,company,email,email_verified,website,segment,source,location,status,research_note,industry,company_size,business_category,recommended_solution,solution_reason",
          )
          .eq("user_id", userId)
          .limit(MAX_LEADS_PER_RUN);

        if (leadIds && leadIds.length > 0) {
          query = query.in("id", leadIds);
        } else {
          query = query.eq("status", "new");
        }

        const { data: leads, error } = await query;
        if (error) throw new Error(`Lead fetch failed: ${error.message}`);

        const queue = (leads as EnrichmentLead[] | null) ?? [];

        if (queue.length === 0) {
          await ctx.log("Nothing to enrich", {
            action: "noop",
            level: "info",
          });
          return {
            enriched_count: 0,
            emails_verified: 0,
            websites_found: 0,
            missing_websites: 0,
          };
        }

        await ctx.log(`Enriching ${queue.length} lead(s)`, {
          action: "enrich_start",
          metadata: { count: queue.length },
        });

        let emailsVerified = 0;
        let websitesFound = 0;
        let missingWebsites = 0;

        for (const lead of queue) {
          // Wrap per-lead work in step.run so Inngest can retry individual
          // failures without rerunning the whole batch.
          const outcome = await step.run(`enrich-${lead.id}`, async () => {
            return await enrichOne(lead, ctx);
          });
          if (outcome.email_verified_now) emailsVerified += 1;
          if (outcome.website_found_now) websitesFound += 1;
          if (outcome.missing_website) missingWebsites += 1;
        }

        const summary = `Enriched ${queue.length} leads (${emailsVerified} emails verified, ${websitesFound} websites found, ${missingWebsites} missing websites)`;
        await ctx.log(summary, {
          action: "enrich_summary",
          level: "success",
          metadata: {
            count: queue.length,
            emailsVerified,
            websitesFound,
            missingWebsites,
          },
        });

        return {
          enriched_count: queue.length,
          emails_verified: emailsVerified,
          websites_found: websitesFound,
          missing_websites: missingWebsites,
        };
      },
    );
  },
);

type Ctx = Parameters<Parameters<typeof runAgent>[3]>[0];

type EnrichOutcome = {
  email_verified_now: boolean;
  website_found_now: boolean;
  missing_website: boolean;
};

async function enrichOne(
  lead: EnrichmentLead,
  ctx: Ctx,
): Promise<EnrichOutcome> {
  const name =
    lead.full_name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    "Unknown";

  // Mark as enriching so the UI can show the in-flight state.
  await ctx.supabase
    .from("leads")
    .update({ status: "enriching" })
    .eq("id", lead.id);

  let email_verified = lead.email_verified;
  let website = lead.website;
  let research_note = lead.research_note ?? "";
  let websiteFoundNow = false;
  let emailVerifiedNow = false;
  // Demo leads keep whatever the DB already holds (backfilled in migration
  // 0004). Real leads get a freshly decided solution below.
  let recommended_solution = lead.recommended_solution;
  let solution_reason = lead.solution_reason;

  try {
    if (lead.source === "demo") {
      // ---- demo lead — simulated enrichment with sleeps ----------------
      await ctx.log(`Verifying email for ${name}…`, {
        action: "enrich_step",
        target_table: "leads",
        target_id: lead.id,
        metadata: { step: "email" },
      });
      await randomSleep(200, 500);

      await ctx.log(`Checking website for ${name}…`, {
        action: "enrich_step",
        target_table: "leads",
        target_id: lead.id,
        metadata: { step: "website" },
      });
      await randomSleep(200, 500);

      const sim = simulateEnrichment(lead);
      email_verified = sim.email_verified;
      if (!email_verified && lead.email_verified) email_verified = false;
      if (sim.email_verified && !lead.email_verified) emailVerifiedNow = true;

      if (sim.website && !lead.website) {
        website = sim.website;
        websiteFoundNow = true;
      } else if (!sim.website) {
        website = null;
      }
      research_note = `${sim.research_note} WEBSITE: ${sim.website_status}`;

      await ctx.log(`Done: ${sim.website_status}`, {
        action: "enrich_step",
        target_table: "leads",
        target_id: lead.id,
        metadata: { step: "done", website_status: sim.website_status },
      });
    } else if (lead.segment === "b2b_global") {
      // ---- real B2B lead ------------------------------------------------
      if (lead.email) {
        const verification = await verifyEmailWithHunter(lead.email);
        if (verification == null) {
          await ctx.log(
            "Hunter API key not set, skipping email verification",
            {
              action: "enrich_step",
              target_table: "leads",
              target_id: lead.id,
              level: "warning",
              metadata: { step: "email" },
            },
          );
          research_note =
            (research_note ? research_note + " | " : "") +
            "EMAIL: skipped (no Hunter key)";
        } else {
          email_verified = verification.verified;
          if (verification.verified) emailVerifiedNow = true;
          research_note =
            (research_note ? research_note + " | " : "") +
            `EMAIL: ${verification.reason} (score ${verification.score})`;
        }
      } else if (lead.website) {
        const domain = extractDomain(lead.website);
        if (domain) {
          const matches = await findEmailsForDomain(domain, 3);
          if (matches.length > 0) {
            // Update lead.email to the first match.
            const m = matches[0];
            research_note =
              (research_note ? research_note + " | " : "") +
              `EMAIL_FOUND: ${m.email} (${m.position || "unknown role"})`;
            await ctx.supabase
              .from("leads")
              .update({ email: m.email })
              .eq("id", lead.id);
          } else {
            research_note =
              (research_note ? research_note + " | " : "") +
              "EMAIL_FOUND: none";
          }
        }
      }
      // Decide which Webiox offering to pitch this B2B lead.
      const decision = decideSolutionForB2B(lead);
      recommended_solution = decision.recommended_solution;
      solution_reason = decision.solution_reason;
    } else if (lead.segment === "local_india") {
      // ---- real local India lead ---------------------------------------
      if (!lead.website && lead.company) {
        await ctx.log(`Finding website for ${name}…`, {
          action: "enrich_step",
          target_table: "leads",
          target_id: lead.id,
          metadata: { step: "website_search" },
        });
        const found = await findLocalBusinessWebsite(
          lead.company,
          lead.location ?? "Gujarat",
        );
        if (found) {
          website = found;
          websiteFoundNow = true;
        }
      }
      const analysis = await analyzeWebsite(website);
      research_note =
        (research_note ? research_note + " | " : "") +
        `WEBSITE: ${analysis.status} | ${analysis.details}`;
      // Decide the solution from website health + business category.
      const decision = decideSolutionForLocal(lead, analysis.status);
      recommended_solution = decision.recommended_solution;
      solution_reason = decision.solution_reason;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    research_note =
      (research_note ? research_note + " | " : "") + `ERROR: ${msg}`;
    await ctx.log(`Enrichment partial-fail for ${name}: ${msg}`, {
      action: "enrich_error",
      target_table: "leads",
      target_id: lead.id,
      level: "warning",
    });
  }

  const missingWebsite = lead.segment === "local_india" && !website;

  // Reset status to 'new' so the next agent (qualifier) can pick it up.
  // recommended_solution / solution_reason are pass-through for demo leads
  // (unchanged from the DB) and freshly decided for real leads.
  await ctx.supabase
    .from("leads")
    .update({
      email_verified,
      website,
      research_note,
      recommended_solution,
      solution_reason,
      status: "new",
    })
    .eq("id", lead.id);

  const summaryBits: string[] = [];
  if (email_verified) summaryBits.push("email verified");
  if (website) summaryBits.push(`website ${website}`);
  if (missingWebsite) summaryBits.push("no website");
  const summary = summaryBits.length ? summaryBits.join(", ") : "no changes";

  await ctx.log(`${name}: ${summary}`, {
    action: "lead_enriched",
    target_table: "leads",
    target_id: lead.id,
    level: "success",
    metadata: { segment: lead.segment, source: lead.source },
  });

  return {
    email_verified_now: emailVerifiedNow,
    website_found_now: websiteFoundNow,
    missing_website: missingWebsite,
  };
}
