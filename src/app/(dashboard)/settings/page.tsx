import { TopBar } from "@/components/dashboard/topbar";
import { createClient } from "@/lib/supabase/server";
import {
  SettingsForm,
  type SettingsFormValues,
} from "@/components/dashboard/settings-form";
import type { Settings } from "@/types/database";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("settings")
    .select(
      "agency_name,sender_name,sender_email,daily_lead_limit,daily_email_limit,icp_job_titles,icp_industries,icp_locations",
    )
    .eq("user_id", user!.id)
    .single();

  const settings = data as Pick<
    Settings,
    | "agency_name"
    | "sender_name"
    | "sender_email"
    | "daily_lead_limit"
    | "daily_email_limit"
    | "icp_job_titles"
    | "icp_industries"
    | "icp_locations"
  > | null;

  const initial: SettingsFormValues = {
    agency_name: settings?.agency_name ?? "Webiox",
    sender_name: settings?.sender_name ?? "",
    sender_email: settings?.sender_email ?? "",
    daily_lead_limit: settings?.daily_lead_limit ?? 50,
    daily_email_limit: settings?.daily_email_limit ?? 100,
    icp_job_titles: settings?.icp_job_titles ?? [],
    icp_industries: settings?.icp_industries ?? [],
    icp_locations: settings?.icp_locations ?? [],
  };

  return (
    <>
      <TopBar title="Settings" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // config · agency tuning
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        <SettingsForm initial={initial} />
      </div>
    </>
  );
}
