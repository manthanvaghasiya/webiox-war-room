import { ExternalLink } from "lucide-react";

import { TopBar } from "@/components/dashboard/topbar";
import { createClient } from "@/lib/supabase/server";
import type { CallStatus } from "@/types/database";

type CallRow = {
  id: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: CallStatus;
  lead: {
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
};

const STATUS_TONE: Record<CallStatus, string> = {
  booked:
    "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
  completed:
    "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  no_show: "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
  cancelled:
    "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-muted)]",
};

export default async function CallsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data } = await supabase
    .from("calls")
    .select(
      "id,scheduled_at,duration_minutes,meeting_url,status,lead:leads(first_name,last_name,company)",
    )
    .eq("user_id", userId)
    .order("scheduled_at", { ascending: true });

  const calls = (data as CallRow[] | null) ?? [];

  return (
    <>
      <TopBar title="Calls" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // calendar · {calls.length} call{calls.length === 1 ? "" : "s"}
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        {calls.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center gap-2 p-12 text-center">
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
              No calls scheduled yet.
            </p>
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              Calls appear here once the Appointment Setter books a discovery
              slot.
            </p>
          </div>
        ) : (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[840px] text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border-base)] text-left text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                  <th className="px-4 py-3 font-normal">Time</th>
                  <th className="px-4 py-3 font-normal">Lead</th>
                  <th className="px-4 py-3 font-normal">Status</th>
                  <th className="px-4 py-3 font-normal text-right">Duration</th>
                  <th className="px-4 py-3 font-normal">Meeting Link</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => {
                  const lead = c.lead;
                  const name =
                    [lead?.first_name, lead?.last_name]
                      .filter(Boolean)
                      .join(" ") ||
                    lead?.company ||
                    "—";
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[color:var(--color-border-base)]/60 last:border-0 hover:bg-[color:var(--color-bg-elevated)]/40"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-[color:var(--color-text-secondary)]">
                        {new Date(c.scheduled_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <div className="text-[color:var(--color-text-primary)]">
                          {name}
                        </div>
                        <div className="text-[10px] text-[color:var(--color-text-muted)]">
                          {lead?.company ?? "—"}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                            STATUS_TONE[c.status]
                          }
                        >
                          {c.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono-num text-xs text-[color:var(--color-text-secondary)]">
                        {c.duration_minutes} min
                      </td>
                      <td className="px-4 py-3">
                        {c.meeting_url ? (
                          <a
                            href={c.meeting_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[color:var(--color-neon-green)] transition hover:underline"
                          >
                            <ExternalLink className="size-3" />
                            Join
                          </a>
                        ) : (
                          <span className="font-mono text-[10px] text-[color:var(--color-text-muted)]">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
