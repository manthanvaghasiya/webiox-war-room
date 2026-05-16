"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { saveSettings } from "@/app/(dashboard)/actions";

export type SettingsFormValues = {
  agency_name: string;
  sender_name: string;
  sender_email: string;
  daily_lead_limit: number;
  daily_email_limit: number;
  icp_job_titles: string[];
  icp_industries: string[];
  icp_locations: string[];
};

export function SettingsForm({ initial }: { initial: SettingsFormValues }) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          try {
            await saveSettings(formData);
            toast.success("Settings saved");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
      className="space-y-6"
    >
      <div className="panel p-6">
        <Section title="Agency">
          <Field label="Agency name" htmlFor="agency_name">
            <input
              id="agency_name"
              name="agency_name"
              type="text"
              defaultValue={initial.agency_name}
              className={inputClass}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Sender name" htmlFor="sender_name">
              <input
                id="sender_name"
                name="sender_name"
                type="text"
                defaultValue={initial.sender_name}
                className={inputClass}
              />
            </Field>
            <Field label="Sender email" htmlFor="sender_email">
              <input
                id="sender_email"
                name="sender_email"
                type="email"
                defaultValue={initial.sender_email}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>
      </div>

      <div className="panel p-6">
        <Section title="Daily Limits">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Field label="Daily lead limit" htmlFor="daily_lead_limit">
              <input
                id="daily_lead_limit"
                name="daily_lead_limit"
                type="number"
                min={0}
                defaultValue={initial.daily_lead_limit}
                className={inputClass}
              />
            </Field>
            <Field label="Daily email limit" htmlFor="daily_email_limit">
              <input
                id="daily_email_limit"
                name="daily_email_limit"
                type="number"
                min={0}
                defaultValue={initial.daily_email_limit}
                className={inputClass}
              />
            </Field>
          </div>
        </Section>
      </div>

      <div className="panel p-6">
        <Section
          title="ICP · Ideal Customer Profile"
          hint="Comma-separated values"
        >
          <Field label="Job titles" htmlFor="icp_job_titles">
            <textarea
              id="icp_job_titles"
              name="icp_job_titles"
              rows={2}
              defaultValue={initial.icp_job_titles.join(", ")}
              className={textareaClass}
              placeholder="VP of Growth, Head of Sales, Founder"
            />
          </Field>
          <Field label="Industries" htmlFor="icp_industries">
            <textarea
              id="icp_industries"
              name="icp_industries"
              rows={2}
              defaultValue={initial.icp_industries.join(", ")}
              className={textareaClass}
              placeholder="SaaS, E-commerce, Marketing Agency"
            />
          </Field>
          <Field label="Locations" htmlFor="icp_locations">
            <textarea
              id="icp_locations"
              name="icp_locations"
              rows={2}
              defaultValue={initial.icp_locations.join(", ")}
              className={textareaClass}
              placeholder="San Francisco, London, Ahmedabad"
            />
          </Field>
        </Section>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20 hover:shadow-[0_0_24px_var(--color-neon-green-dim)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "w-full rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/60 px-3 py-2 font-mono text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_3px_var(--color-neon-green-dim)]";

const textareaClass = inputClass + " resize-y";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="mb-2 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-neon-green)]">
          {title}
        </span>
        {hint ? (
          <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
