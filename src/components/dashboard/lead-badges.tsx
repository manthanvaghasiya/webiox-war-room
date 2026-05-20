// Pure presentational badges shared by the leads table (client component) and
// the qualified page (server component). No hooks, no "use client" — safe in
// either environment.

import { SOLUTIONS, type LeadSegment, type SolutionType } from "@/types/database";

const SOLUTION_BY_ID = Object.fromEntries(
  SOLUTIONS.map((s) => [s.id, s]),
) as Record<SolutionType, (typeof SOLUTIONS)[number]>;

export function SegmentBadge({ segment }: { segment: LeadSegment }) {
  if (segment === "b2b_global") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
        style={{
          color: "var(--color-neon-purple)",
          backgroundColor: "var(--color-neon-purple-dim)",
        }}
      >
        <span aria-hidden>🌐</span>B2B
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider"
      style={{
        color: "var(--color-neon-amber)",
        backgroundColor: "var(--color-neon-amber-dim)",
      }}
    >
      <span aria-hidden>🇮🇳</span>Local
    </span>
  );
}

export function SolutionBadge({
  solution,
}: {
  solution: SolutionType | null;
}) {
  const meta = solution ? SOLUTION_BY_ID[solution] : undefined;
  if (!meta) {
    return (
      <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
        —
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider"
      style={{
        color: meta.color,
        borderLeft: `2px solid ${meta.color}`,
        backgroundColor:
          "color-mix(in srgb, var(--color-bg-elevated) 80%, transparent)",
      }}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
    </span>
  );
}

// Confidence tier derived from lead_score (Step 13). The scout filters out
// weak (<50) before insert, so the gray "—" path should rarely render.
export function TierBadge({ score }: { score: number }) {
  if (score >= 75) {
    const color = "#00ff88";
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
        style={{
          color,
          borderLeft: `2px solid ${color}`,
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
        title={`Confirmed lead (${score}% confidence)`}
      >
        <span aria-hidden>🟢</span>Confirmed
      </span>
    );
  }
  if (score >= 50) {
    const color = "#fbbf24";
    return (
      <span
        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
        style={{
          color,
          borderLeft: `2px solid ${color}`,
          backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        }}
        title={`Probable lead (${score}% confidence)`}
      >
        <span aria-hidden>🟡</span>Probable
      </span>
    );
  }
  return (
    <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
      —
    </span>
  );
}

// Colored score badge. 0 → dash; <40 red; 40-69 amber; 70-89 green; 90+ glow.
export function ScoreBadge({
  score,
  reason,
}: {
  score: number;
  reason?: string | null;
}) {
  if (!score || score <= 0) {
    return (
      <span className="font-mono-num text-xs text-[color:var(--color-text-muted)]">
        —
      </span>
    );
  }

  let color = "#ff3366";
  let glow = false;
  if (score >= 90) {
    color = "#00ff88";
    glow = true;
  } else if (score >= 70) {
    color = "#00ff88";
  } else if (score >= 40) {
    color = "#fbbf24";
  }

  return (
    <span
      title={reason ?? undefined}
      className="inline-flex min-w-[34px] items-center justify-center rounded px-1.5 py-0.5 font-mono-num text-xs font-semibold"
      style={{
        color,
        borderLeft: `2px solid ${color}`,
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        boxShadow: glow ? `0 0 8px ${color}` : undefined,
      }}
    >
      {score}
    </span>
  );
}
