"use client";

import { useState, useTransition } from "react";
import {
  Crosshair,
  Repeat,
  Rocket,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  triggerDataEnricher,
  triggerFollowupSpecialist,
  triggerLeadQualifier,
  triggerLeadScout,
  triggerPersonalizer,
} from "@/app/(dashboard)/actions";
import type { AgentName } from "@/types/database";

type AgentAction = {
  id: AgentName;
  label: string;
  sublabel: string;
  successToast: string;
  action: () => Promise<{ ok: true }>;
  icon: LucideIcon;
  color: string;
};

const AGENT_ACTIONS: AgentAction[] = [
  {
    id: "lead_scout",
    label: "Initiate Lead Scout",
    sublabel: "Find new leads",
    successToast: "🟢 Lead Scout dispatched",
    action: triggerLeadScout,
    icon: Rocket,
    color: "var(--color-neon-green)",
  },
  {
    id: "data_enricher",
    label: "Initiate Data Enricher",
    sublabel: "Verify & enrich data",
    successToast: "🟢 Data Enricher dispatched",
    action: triggerDataEnricher,
    icon: ShieldCheck,
    color: "var(--color-neon-green)",
  },
  {
    id: "lead_qualifier",
    label: "Initiate Lead Qualifier",
    sublabel: "Score & qualify leads",
    successToast: "🟢 Lead Qualifier dispatched",
    action: triggerLeadQualifier,
    icon: Crosshair,
    color: "var(--color-neon-green)",
  },
  {
    id: "personalizer",
    label: "Launch Outreach Campaign",
    sublabel: "Write, translate & send (demo)",
    successToast: "🟢 Outreach campaign launched",
    action: triggerPersonalizer,
    icon: Send,
    color: "var(--color-neon-green)",
  },
  {
    id: "followup_specialist",
    label: "Run Follow-ups Now",
    sublabel: "Send 3/7/14-day follow-ups",
    successToast: "🟡 Follow-up Specialist dispatched",
    action: triggerFollowupSpecialist,
    icon: Repeat,
    color: "#fbbf24",
  },
];

export function AgentActionButtons() {
  return (
    <div className="flex w-full gap-3 overflow-x-auto pb-1">
      {AGENT_ACTIONS.map((a) => (
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
      className="group flex min-w-[230px] flex-col items-start gap-1 rounded-md border px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-70"
      style={{
        borderColor: action.color,
        backgroundColor: "color-mix(in srgb, var(--color-bg-elevated) 70%, transparent)",
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

  const action = AGENT_ACTIONS.find((a) => a.id === agentId);
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
