"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { saveIcpSettings } from "@/app/(dashboard)/settings/actions";
import {
  CITY_OPTIONS,
  COUNTRY_OPTIONS,
  SOLUTION_FILTER_OPTIONS,
  STATE_OPTIONS,
  VERTICAL_OPTIONS,
  type Settings,
} from "@/types/database";

export type IcpFormInitial = Pick<
  Settings,
  | "agency_name"
  | "sender_name"
  | "sender_email"
  | "target_vertical"
  | "custom_keyword"
  | "search_cities"
  | "min_rating"
  | "min_reviews"
  | "max_results_per_run"
  | "exclude_franchises"
  | "require_preowned_keyword"
  | "prioritize_no_website"
  | "daily_lead_limit"
  | "daily_email_limit"
  | "target_solutions"
  | "target_country"
  | "target_state"
  | "automation_mode"
  | "automation_daily_target"
  | "automation_min_confidence"
>;

export function IcpSettingsForm({ initial }: { initial: IcpFormInitial }) {
  const [pending, startTransition] = useTransition();
  const [rating, setRating] = useState(initial.min_rating ?? 4.0);
  const [error, setError] = useState<string | null>(null);

  // ----- Automation toggle state -----
  const [automationOn, setAutomationOn] = useState(
    initial.automation_mode ?? false,
  );
  const [automationConfidence, setAutomationConfidence] = useState(
    initial.automation_min_confidence ?? 75,
  );
  const [automationTarget, setAutomationTarget] = useState(
    initial.automation_daily_target ?? 5,
  );

  // ----- Solutions multi-select state -----
  const initialSolutions = new Set(
    initial.target_solutions ?? ["website", "custom_software", "automation"],
  );
  const [solutions, setSolutions] = useState<Set<string>>(initialSolutions);
  const toggleSolution = (value: string) => {
    setSolutions((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  // ----- Geography cascade state -----
  const [country, setCountry] = useState(initial.target_country ?? "IN");
  const [state, setState] = useState(initial.target_state ?? "GJ");
  const [selectedCities, setSelectedCities] = useState<Set<string>>(
    new Set(initial.search_cities ?? CITY_OPTIONS[state] ?? []),
  );

  // List of states for the current country (empty array = no list defined).
  const statesForCountry = useMemo(
    () => STATE_OPTIONS[country] ?? [],
    [country],
  );

  // Cities for the current state.
  const citiesForState = useMemo(
    () => CITY_OPTIONS[state] ?? [],
    [state],
  );

  // Switching countries resets state → first enabled state of new country and
  // rechecks all cities for that state. Disabled options never become selected.
  const handleCountryChange = (next: string) => {
    setCountry(next);
    const states = STATE_OPTIONS[next] ?? [];
    const firstEnabled = states.find((s) => s.enabled)?.code;
    if (firstEnabled) {
      setState(firstEnabled);
      setSelectedCities(new Set(CITY_OPTIONS[firstEnabled] ?? []));
    } else {
      setState("");
      setSelectedCities(new Set());
    }
  };

  // Switching state rechecks all cities for that state (sensible default; the
  // user almost always wants the whole region they just picked).
  const handleStateChange = (next: string) => {
    setState(next);
    setSelectedCities(new Set(CITY_OPTIONS[next] ?? []));
  };

  const toggleCity = (city: string) => {
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  };

  return (
    <form
      action={(formData) => {
        // Cities are only required when automation is OFF. Automation mode
        // ignores manual ICP settings anyway, so empty cities won't block save.
        if (!automationOn && formData.getAll("search_cities").length === 0) {
          setError("Select at least one city");
          return;
        }
        setError(null);
        startTransition(async () => {
          try {
            await saveIcpSettings(formData);
            toast.success(
              automationOn
                ? "🪄 Automation mode saved. Next scout run hunts top-tier leads automatically."
                : "ICP saved. Next 'Hunt Real Leads' run uses these settings.",
            );
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Save failed");
          }
        });
      }}
      className="space-y-6"
    >
      {/* SECTION 0 — Automation Mode (always first) */}
      <AutomationSection
        on={automationOn}
        setOn={setAutomationOn}
        confidence={automationConfidence}
        setConfidence={setAutomationConfidence}
        target={automationTarget}
        setTarget={setAutomationTarget}
      />

      {/* Manual ICP — visually grayed out when automation is ON. Inputs still
          submit, the disabled look is opacity + an overlay banner only. */}
      <div className="relative">
        {automationOn ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center pt-6">
            <span className="rounded-md border border-[color:var(--color-neon-purple)] bg-[color:var(--color-bg-elevated)]/90 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-neon-purple)] shadow-[0_0_18px_color-mix(in_srgb,var(--color-neon-purple)_45%,transparent)]">
              🪄 Automation is ON — these settings are ignored
            </span>
          </div>
        ) : null}
        <div
          className={
            "space-y-6 transition " +
            (automationOn ? "opacity-50" : "opacity-100")
          }
        >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SECTION 1 — Agency Identity */}
        <SectionCard title="Agency Identity">
          <Field label="Agency name" htmlFor="agency_name">
            <input
              id="agency_name"
              name="agency_name"
              type="text"
              defaultValue={initial.agency_name ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Sender name" htmlFor="sender_name">
            <input
              id="sender_name"
              name="sender_name"
              type="text"
              defaultValue={initial.sender_name ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Sender email" htmlFor="sender_email">
            <input
              id="sender_email"
              name="sender_email"
              type="email"
              defaultValue={initial.sender_email ?? ""}
              className={inputClass}
            />
          </Field>
        </SectionCard>

        {/* SECTION 2 — ICP: Target Vertical */}
        <SectionCard title="ICP · Target Vertical">
          <Field label="Vertical" htmlFor="target_vertical">
            <select
              id="target_vertical"
              name="target_vertical"
              defaultValue={initial.target_vertical ?? "car_dealer"}
              className={selectClass}
            >
              {VERTICAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Custom keyword (optional)" htmlFor="custom_keyword">
            <input
              id="custom_keyword"
              name="custom_keyword"
              type="text"
              defaultValue={initial.custom_keyword ?? ""}
              placeholder="e.g. 'luxury car dealer Bopal Ahmedabad'"
              className={inputClass}
            />
            <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-muted)]">
              Leave blank to use the vertical&apos;s preset queries.
            </p>
          </Field>
        </SectionCard>
      </div>

      {/* SECTION 3 — Solutions I Pitch (full width) */}
      <SectionCard title="ICP · Solutions I Pitch">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {SOLUTION_FILTER_OPTIONS.map((opt) => {
            const checked = solutions.has(opt.value);
            return (
              <label
                key={opt.value}
                className={
                  "group flex cursor-pointer items-center gap-3 rounded-md border px-4 py-3 transition " +
                  (checked
                    ? ""
                    : "border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/40 hover:border-[color:var(--color-border-bright)]")
                }
                style={
                  checked
                    ? {
                        borderColor: opt.color,
                        backgroundColor: `color-mix(in srgb, ${opt.color} 12%, transparent)`,
                      }
                    : undefined
                }
              >
                <input
                  type="checkbox"
                  name="target_solutions"
                  value={opt.value}
                  checked={checked}
                  onChange={() => toggleSolution(opt.value)}
                  className="h-4 w-4 accent-[color:var(--color-neon-green)]"
                />
                <span className="text-xl" aria-hidden>
                  {opt.emoji}
                </span>
                <span
                  className="font-mono text-xs uppercase tracking-wider"
                  style={{
                    color: checked
                      ? opt.color
                      : "var(--color-text-primary)",
                  }}
                >
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
        <p className="font-mono text-[10px] leading-relaxed text-[color:var(--color-text-muted)]">
          Select what you want to sell. If all 3 (or none) selected → random
          suitable lead, regardless of solution.
        </p>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* SECTION 4 — Geographic Coverage (cascade) */}
        <SectionCard title="ICP · Geographic Coverage">
          <Field label="Country" htmlFor="target_country">
            <select
              id="target_country"
              name="target_country"
              value={country}
              onChange={(e) => handleCountryChange(e.target.value)}
              className={selectClass}
            >
              {COUNTRY_OPTIONS.map((opt) => (
                <option
                  key={opt.code}
                  value={opt.code}
                  disabled={!opt.enabled}
                  style={
                    !opt.enabled
                      ? { color: "#666", fontStyle: "italic" }
                      : undefined
                  }
                >
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="State / Region" htmlFor="target_state">
            <select
              id="target_state"
              name="target_state"
              value={state}
              onChange={(e) => handleStateChange(e.target.value)}
              className={selectClass}
              disabled={statesForCountry.length === 0}
            >
              {statesForCountry.length === 0 ? (
                <option value="">— No states available —</option>
              ) : (
                statesForCountry.map((opt) => (
                  <option
                    key={opt.code}
                    value={opt.code}
                    disabled={!opt.enabled}
                    style={
                      !opt.enabled
                        ? { color: "#666", fontStyle: "italic" }
                        : undefined
                    }
                  >
                    {opt.label}
                  </option>
                ))
              )}
            </select>
          </Field>

          <div className="space-y-1">
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
              Cities
            </span>
            <div className="grid grid-cols-2 gap-2">
              {citiesForState.map((city) => (
                <label
                  key={city}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/40 px-3 py-2 transition hover:border-[color:var(--color-neon-green)]"
                >
                  <input
                    type="checkbox"
                    name="search_cities"
                    value={city}
                    checked={selectedCities.has(city)}
                    onChange={() => toggleCity(city)}
                    className="h-4 w-4 accent-[color:var(--color-neon-green)]"
                  />
                  <span className="font-mono text-xs text-[color:var(--color-text-primary)]">
                    {city}
                  </span>
                </label>
              ))}
            </div>
            {error ? (
              <p className="font-mono text-[11px] text-[color:var(--color-neon-red)]">
                {error}
              </p>
            ) : null}
            <p className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
              At least one city required.
            </p>
          </div>
        </SectionCard>

        {/* SECTION 5 — Premium Filters */}
        <SectionCard title="ICP · Premium Filters">
          <Field
            label={`Minimum rating: ${rating.toFixed(1)}★`}
            htmlFor="min_rating"
          >
            <input
              id="min_rating"
              name="min_rating"
              type="range"
              min={3.0}
              max={5.0}
              step={0.1}
              defaultValue={rating}
              onChange={(e) => setRating(parseFloat(e.target.value))}
              className="w-full accent-[color:var(--color-neon-green)]"
            />
            <div className="flex justify-between font-mono text-[10px] text-[color:var(--color-text-muted)]">
              <span>3.0★</span>
              <span>5.0★</span>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min reviews" htmlFor="min_reviews">
              <input
                id="min_reviews"
                name="min_reviews"
                type="number"
                min={10}
                max={10000}
                step={10}
                defaultValue={initial.min_reviews ?? 100}
                className={inputClass}
              />
            </Field>
            <Field label="Max results / run" htmlFor="max_results_per_run">
              <input
                id="max_results_per_run"
                name="max_results_per_run"
                type="number"
                min={5}
                max={100}
                step={5}
                defaultValue={initial.max_results_per_run ?? 50}
                className={inputClass}
              />
            </Field>
          </div>
        </SectionCard>
      </div>

      {/* SECTION 6 — Filter Toggles (full width) */}
      <SectionCard title="ICP · Filter Toggles">
        <ToggleRow
          name="exclude_franchises"
          label="Exclude franchise dealers"
          helper="Skip NEXA, Maruti, Hyundai, Tata, Cars24, etc. Recommended for independent agency outreach."
          defaultChecked={initial.exclude_franchises ?? true}
        />
        <ToggleRow
          name="require_preowned_keyword"
          label="Require pre-owned keyword in name"
          helper="Only match leads with 'pre-owned' / 'used' / 'second hand' in their name. Strictest filter — turn off if you want all independents."
          defaultChecked={initial.require_preowned_keyword ?? false}
        />
        <ToggleRow
          name="prioritize_no_website"
          label="Prioritize leads without a website"
          helper="Show leads without websites first (easiest pitch)."
          defaultChecked={initial.prioritize_no_website ?? true}
        />
      </SectionCard>

      {/* SECTION 7 — Daily Limits */}
      <SectionCard title="Daily Limits">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Daily lead limit" htmlFor="daily_lead_limit">
            <input
              id="daily_lead_limit"
              name="daily_lead_limit"
              type="number"
              min={0}
              defaultValue={initial.daily_lead_limit ?? 50}
              className={inputClass}
            />
          </Field>
          <Field label="Daily email limit" htmlFor="daily_email_limit">
            <input
              id="daily_email_limit"
              name="daily_email_limit"
              type="number"
              min={0}
              defaultValue={initial.daily_email_limit ?? 30}
              className={inputClass}
            />
          </Field>
        </div>
      </SectionCard>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pb-8">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20 hover:shadow-[0_0_24px_var(--color-neon-green-dim)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Saving…" : automationOn ? "💾 SAVE AUTOMATION" : "💾 SAVE ICP"}
        </button>
      </div>
    </form>
  );
}

// ===== Automation Section ====================================================

function AutomationSection({
  on,
  setOn,
  confidence,
  setConfidence,
  target,
  setTarget,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  confidence: number;
  setConfidence: (v: number) => void;
  target: number;
  setTarget: (v: number) => void;
}) {
  return (
    <div
      className="panel relative overflow-hidden p-5"
      style={{
        borderColor: on
          ? "var(--color-neon-purple)"
          : "var(--color-border-base)",
        boxShadow: on
          ? "0 0 22px color-mix(in srgb, var(--color-neon-purple) 35%, transparent)"
          : undefined,
      }}
    >
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[color:var(--color-neon-purple)] to-transparent opacity-60" />
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-neon-purple)]">
          🪄 Automation Mode
        </span>
        <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        <span
          className="font-mono text-[10px] uppercase tracking-[0.22em]"
          style={{
            color: on
              ? "var(--color-neon-purple)"
              : "var(--color-text-muted)",
          }}
        >
          {on ? "ON" : "OFF"}
        </span>
      </div>

      <label className="flex cursor-pointer items-start gap-4 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/40 p-4 transition hover:border-[color:var(--color-neon-purple)]">
        <input
          type="checkbox"
          name="automation_mode"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full bg-[color:var(--color-bg-elevated)] ring-1 ring-[color:var(--color-border-base)] transition-colors peer-checked:bg-[color:var(--color-neon-purple)]/30 peer-checked:ring-[color:var(--color-neon-purple)]"
        >
          <span className="ml-0.5 inline-block h-4 w-4 transform rounded-full bg-[color:var(--color-text-secondary)] shadow transition peer-checked:translate-x-4 peer-checked:bg-[color:var(--color-neon-purple)]" />
        </span>
        <div className="flex-1 space-y-1">
          <div className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-text-primary)]">
            Hands-off automation hunter
          </div>
          <p className="font-mono text-[10px] leading-relaxed text-[color:var(--color-text-muted)]">
            When ON, Lead Scout ignores manual ICP and sweeps 6 high-conversion
            verticals across Gujarat (priority) + 10 metros, returning only
            top-tier leads.
          </p>
        </div>
      </label>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          label={`Confidence threshold: ${confidence}%`}
          htmlFor="automation_min_confidence"
        >
          <input
            id="automation_min_confidence"
            name="automation_min_confidence"
            type="range"
            min={60}
            max={95}
            step={5}
            value={confidence}
            onChange={(e) => setConfidence(parseInt(e.target.value, 10))}
            className="w-full accent-[color:var(--color-neon-purple)]"
          />
          <div className="flex justify-between font-mono text-[10px] text-[color:var(--color-text-muted)]">
            <span>60%</span>
            <span>95%</span>
          </div>
        </Field>
        <Field label="Daily lead target" htmlFor="automation_daily_target">
          <input
            id="automation_daily_target"
            name="automation_daily_target"
            type="number"
            min={1}
            max={15}
            step={1}
            value={target}
            onChange={(e) =>
              setTarget(
                Math.max(1, Math.min(15, parseInt(e.target.value || "5", 10))),
              )
            }
            className={inputClass}
          />
          <p className="mt-1 font-mono text-[10px] text-[color:var(--color-text-muted)]">
            Hard cap 15 / day for cost control.
          </p>
        </Field>
      </div>

      <div className="mt-4 space-y-2 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/40 p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-neon-purple)]">
          When ON, AI scans
        </p>
        <ul className="space-y-1 font-mono text-[11px] text-[color:var(--color-text-secondary)]">
          <li>📍 Gujarat tier-1 (priority, +10 confidence) + 10 Indian metros</li>
          <li>
            🏢 Car dealers • Clinics • Real Estate • Schools • Jewelry •
            Manufacturers
          </li>
          <li>✓ Premium signals only (≥{confidence}% confidence)</li>
        </ul>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
          Manual settings below are ignored.
        </p>
      </div>
    </div>
  );
}

// ===== Visual primitives =====================================================

const inputClass =
  "w-full rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/60 px-3 py-2 font-mono text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_3px_var(--color-neon-green-dim)]";

const selectClass = inputClass + " appearance-none cursor-pointer";

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[color:var(--color-neon-green)] to-transparent opacity-40" />
      <div className="mb-4 flex items-baseline gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-neon-green)]">
          {title}
        </span>
        <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
      </div>
      <div className="space-y-4">{children}</div>
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

// Native checkbox styled to look like a toggle switch. Plays nicely with
// FormData (boolean.get(name) === 'on' when checked) and works without JS.
function ToggleRow({
  name,
  label,
  helper,
  defaultChecked,
}: {
  name: string;
  label: string;
  helper: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-4 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/30 p-4 transition hover:border-[color:var(--color-border-bright)]">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative mt-0.5 inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full bg-[color:var(--color-bg-elevated)] ring-1 ring-[color:var(--color-border-base)] transition-colors peer-checked:bg-[color:var(--color-neon-green)]/30 peer-checked:ring-[color:var(--color-neon-green)] peer-focus-visible:shadow-[0_0_0_3px_var(--color-neon-green-dim)]"
      >
        <span className="ml-0.5 inline-block h-4 w-4 transform rounded-full bg-[color:var(--color-text-secondary)] shadow transition peer-checked:bg-[color:var(--color-neon-green)] group-has-[input:checked]:translate-x-4 group-has-[input:checked]:bg-[color:var(--color-neon-green)]" />
      </span>
      <div className="flex-1 space-y-1">
        <div className="font-mono text-xs uppercase tracking-wider text-[color:var(--color-text-primary)]">
          {label}
        </div>
        <p className="font-mono text-[10px] leading-relaxed text-[color:var(--color-text-muted)]">
          {helper}
        </p>
      </div>
    </label>
  );
}
