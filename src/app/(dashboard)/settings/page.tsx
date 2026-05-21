import { TopBar } from "@/components/dashboard/topbar";
import {
  IcpSettingsForm,
  type IcpFormInitial,
} from "@/components/dashboard/icp-settings-form";
import { createClient } from "@/lib/supabase/server";
import { CITY_OPTIONS, type Settings } from "@/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("settings")
    .select(
      [
        "agency_name",
        "sender_name",
        "sender_email",
        "target_vertical",
        "custom_keyword",
        "search_cities",
        "min_rating",
        "min_reviews",
        "max_results_per_run",
        "exclude_franchises",
        "require_preowned_keyword",
        "prioritize_no_website",
        "daily_lead_limit",
        "daily_email_limit",
        "target_solutions",
        "target_country",
        "target_state",
        "automation_mode",
        "automation_daily_target",
        "automation_min_confidence",
      ].join(","),
    )
    .eq("user_id", user!.id)
    .single();

  const settings = data as Partial<Settings> | null;

  const country = settings?.target_country ?? "IN";
  const state = settings?.target_state ?? "GJ";
  const defaultCities = CITY_OPTIONS[state] ?? CITY_OPTIONS.GJ ?? [];

  const initial: IcpFormInitial = {
    agency_name: settings?.agency_name ?? "Webiox",
    sender_name: settings?.sender_name ?? null,
    sender_email: settings?.sender_email ?? null,
    target_vertical: settings?.target_vertical ?? "car_dealer",
    custom_keyword: settings?.custom_keyword ?? null,
    search_cities: settings?.search_cities ?? defaultCities,
    min_rating: settings?.min_rating ?? 4.0,
    min_reviews: settings?.min_reviews ?? 100,
    max_results_per_run: settings?.max_results_per_run ?? 50,
    exclude_franchises: settings?.exclude_franchises ?? true,
    require_preowned_keyword: settings?.require_preowned_keyword ?? false,
    prioritize_no_website: settings?.prioritize_no_website ?? true,
    daily_lead_limit: settings?.daily_lead_limit ?? 50,
    daily_email_limit: settings?.daily_email_limit ?? 30,
    target_solutions: settings?.target_solutions ?? [
      "website",
      "custom_software",
      "automation",
    ],
    target_country: country,
    target_state: state,
    automation_mode: settings?.automation_mode ?? false,
    automation_daily_target: settings?.automation_daily_target ?? 5,
    automation_min_confidence: settings?.automation_min_confidence ?? 75,
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // config · ideal customer profile · agency tuning
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        <IcpSettingsForm initial={initial} />
      </div>
    </>
  );
}
