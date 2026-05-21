"use client";

import { useState, useTransition } from "react";
import {
  Crosshair,
  Flame,
  Repeat,
  Send,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  triggerDataEnricher,
  triggerFollowupSpecialist,
  triggerLeadQualifier,
  triggerLeadScoutReal,
  triggerPersonalizer,
} from "@/app/(dashboard)/actions";
import type { AgentName } from "@/types/database";

type AgentAction = {
  id: string; // unique action id (may differ from the agent it maps to)
  agent: AgentName; // agent whose sidebar state this action drives
  label: string;
  sublabel: string;
  successToast: string;
  action: () => Promise<{ ok: true }>;
  icon: LucideIcon;
  color: string;
  glow?: boolean; // render a neon glow to highlight a hero action
};

// Lead scout action — the label/sublabel/icon swap between manual and
// automation modes is applied dynamically in AgentActionButtons.
const LEAD_SCOUT_ACTION_MANUAL: AgentAction = {
  id: "lead_scout_real",
  agent: "lead_scout",
  label: "🔥 Hunt Real Gujarat Leads",
  sublabel: "Manual settings",
  successToast: "🔥 Real Lead Scout dispatched — this can take 1-3 min",
  action: triggerLeadScoutReal,
  icon: Flame,
  color: "#00ff88",
  glow: true,
};

const LEAD_SCOUT_ACTION_AUTOMATION: AgentAction = {
  id: "lead_scout_real",
  agent: "lead_scout",
  label: "🪄 RUN AUTOMATION",
  sublabel: "AI hunts top-tier leads (5/day)",
  successToast: "🪄 Automation hunter dispatched — this can take 2-4 min",
  action: triggerLeadScoutReal,
  icon: Sparkles,
  color: "#a855f7",
  glow: true,
};

const AGENT_ACTIONS: AgentAction[] = [
  LEAD_SCOUT_ACTION_MANUAL,
  {
    id: "data_enricher",
    agent: "data_enricher",
    label: "Initiate Data Enricher",
    sublabel: "Verify & enrich data",
    successToast: "🟢 Data Enricher dispatched",
    action: triggerDataEnricher,
    icon: ShieldCheck,
    color: "var(--color-neon-green)",
  },
  {
    id: "lead_qualifier",
    agent: "lead_qualifier",
    label: "Initiate Lead Qualifier",
    sublabel: "Score & qualify leads",
    successToast: "🟢 Lead Qualifier dispatched",
    action: triggerLeadQualifier,
    icon: Crosshair,
    color: "var(--color-neon-green)",
  },
  {
    id: "personalizer",
    agent: "personalizer",
    label: "Launch Outreach Campaign",
    sublabel: "Write, translate & send (demo)",
    successToast: "🟢 Outreach campaign launched",
    action: triggerPersonalizer,
    icon: Send,
    color: "var(--color-neon-green)",
  },
  {
    id: "followup_specialist",
    agent: "followup_specialist",
    label: "Run Follow-ups Now",
    sublabel: "Send 3/7/14-day follow-ups",
    successToast: "🟡 Follow-up Specialist dispatched",
    action: triggerFollowupSpecialist,
    icon: Repeat,
    color: "#fbbf24",
  },
];

export function AgentActionButtons({
  automationMode = false,
}: {
  automationMode?: boolean;
}) {
  // Swap the lead_scout_real card for the automation variant when ON.
  const actions = AGENT_ACTIONS.map((a) =>
    a.id === "lead_scout_real" && automationMode
      ? LEAD_SCOUT_ACTION_AUTOMATION
      : a,
  );
  return (
    <div className="flex w-full gap-3 overflow-x-auto pb-1">
      {actions.map((a) => (
        <AgentActionButton key={a.id} action={a} />
      ))}
    </div>
  );
}

function AgentActionButton({ action }: { action: AgentAction }) {
  const [dispatching, setDispatching] = useState(false);
  const [, startTransition] = useTransition();
  const Icon = action.icon;

  const onClick = () => {
    if (dispatching) return;
    setDispatching(true);
    startTransition(async () => {
      try {
        await action.action();
        toast.success(action.successToast);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dispatch failed");
      } finally {
        setTimeout(() => setDispatching(false), 800);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dispatching}
      className="group flex min-w-[230px] flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        borderColor: action.color,
        backgroundColor: action.glow
          ? `color-mix(in srgb, ${action.color} 14%, var(--color-bg-elevated))`
          : "color-mix(in srgb, var(--color-bg-elevated) 70%, transparent)",
        boxShadow: action.glow
          ? `0 0 22px color-mix(in srgb, ${action.color} 45%, transparent)`
          : undefined,
      }}
    >
      <span className="flex items-center gap-2">
        <Icon
          className={"size-4 " + (dispatching ? "animate-pulse" : "")}
          style={{ color: action.color }}
        />
        <span
          className="font-mono text-xs uppercase tracking-[0.22em]"
          style={{ color: action.color }}
        >
          {dispatching ? "Dispatching…" : action.label}
        </span>
      </span>
      <span className="text-[11px] text-[color:var(--color-text-secondary)]">
        {action.sublabel}
      </span>
    </button>
  );
}

// Compact single-button variant — used inside the leads-table empty state and
// as the "Enrich All New" CTA on the leads page header.
export function AgentActionInline({
  agentId,
  label,
  className,
}: {
  agentId: AgentName;
  label?: string;
  className?: string;
}) {
  const [dispatching, setDispatching] = useState(false);
  const [, startTransition] = useTransition();

  // Match by mapped agent — the first action mapped to this agent is used.
  const action = AGENT_ACTIONS.find((a) => a.agent === agentId);
  if (!action) return null;
  const Icon = action.icon;

  const onClick = () => {
    if (dispatching) return;
    setDispatching(true);
    startTransition(async () => {
      try {
        await action.action();
        toast.success(action.successToast);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Dispatch failed");
      } finally {
        setTimeout(() => setDispatching(false), 800);
      }
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={dispatching}
      className={
        className ??
        "inline-flex items-center gap-2 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.25em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20 hover:shadow-[0_0_24px_var(--color-neon-green-dim)] disabled:cursor-not-allowed disabled:opacity-70"
      }
    >
      <Icon className={"size-4 " + (dispatching ? "animate-pulse" : "")} />
      {dispatching ? "Dispatching…" : (label ?? action.label)}
    </button>
  );
}
