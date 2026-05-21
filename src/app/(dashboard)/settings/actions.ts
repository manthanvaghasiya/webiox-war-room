"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// Persists the user's ICP (target vertical + cities + premium thresholds +
// filter toggles) and agency identity. The real Lead Scout reads from these
// columns on its next run.
export async function saveIcpSettings(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // FormData.getAll() returns one entry per checked checkbox with the same
  // `name="search_cities"` attribute — preserves no-JS behavior.
  const cities = formData
    .getAll("search_cities")
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean);
  if (cities.length === 0) throw new Error("Select at least one city");

  const parseNum = (key: string, fallback: number): number => {
    const raw = String(formData.get(key) ?? "").trim();
    if (!raw) return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  };

  // Solutions filter. The scout treats 0 OR 3 selections as "random mode" —
  // both store as the full set so downstream code can read it uniformly.
  const ALL_SOLUTIONS = ["website", "custom_software", "automation"] as const;
  const solutionsRaw = formData
    .getAll("target_solutions")
    .map(String)
    .map((s) => s.trim())
    .filter((s) => (ALL_SOLUTIONS as readonly string[]).includes(s));
  const finalSolutions =
    solutionsRaw.length === 0 || solutionsRaw.length === ALL_SOLUTIONS.length
      ? [...ALL_SOLUTIONS]
      : solutionsRaw;

  const country = String(formData.get("target_country") ?? "IN").trim() || "IN";
  const state = String(formData.get("target_state") ?? "GJ").trim() || "GJ";

  const updates = {
    agency_name: String(formData.get("agency_name") ?? "").trim() || null,
    sender_name: String(formData.get("sender_name") ?? "").trim() || null,
    sender_email: String(formData.get("sender_email") ?? "").trim() || null,
    target_vertical: String(formData.get("target_vertical") ?? "car_dealer"),
    custom_keyword:
      String(formData.get("custom_keyword") ?? "").trim() || null,
    search_cities: cities,
    min_rating: parseNum("min_rating", 4.0),
    min_reviews: Math.round(parseNum("min_reviews", 100)),
    max_results_per_run: Math.round(parseNum("max_results_per_run", 50)),
    exclude_franchises: formData.get("exclude_franchises") === "on",
    require_preowned_keyword:
      formData.get("require_preowned_keyword") === "on",
    prioritize_no_website: formData.get("prioritize_no_website") === "on",
    daily_lead_limit: Math.max(0, Math.round(parseNum("daily_lead_limit", 50))),
    daily_email_limit: Math.max(
      0,
      Math.round(parseNum("daily_email_limit", 30)),
    ),
    target_solutions: finalSolutions,
    target_country: country,
    target_state: state,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("settings")
    .update(updates)
    .eq("user_id", user.id);

  if (error) throw new Error(`Save failed: ${error.message}`);

  revalidatePath("/settings");
  return { ok: true as const };
}
