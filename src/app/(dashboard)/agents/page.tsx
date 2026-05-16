import { TopBar } from "@/components/dashboard/topbar";
import { createClient } from "@/lib/supabase/server";
import { AGENTS, type AgentName, type AgentState } from "@/types/database";

const STATE_LABEL: Record<AgentState, string> = {
  idle: "IDLE",
  running: "RUNNING",
  error: "ERROR",
  paused: "PAUSED",
};

const STATE_TONE: Record<AgentState, string> = {
  idle: "bg-[color:var(--color-bg-elevated)] text-[color:var(--color-text-muted)]",
  running: "bg-[color:var(--color-neon-green-dim)] text-[color:var(--color-neon-green)]",
  error: "bg-[color:var(--color-neon-red)]/20 text-[color:var(--color-neon-red)]",
  paused: "bg-[color:var(--color-neon-amber-dim)] text-[color:var(--color-neon-amber)]",
};

async function fetchAgentStates(userId: string): Promise<Record<AgentName, AgentState>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_status")
    .select("agent,state")
    .eq("user_id", userId);

  const map = Object.fromEntries(AGENTS.map((a) => [a.id, "idle"])) as Record<
    AgentName,
    AgentState
  >;
  (data ?? []).forEach((row: { agent: AgentName; state: AgentState }) => {
    map[row.agent] = row.state;
  });
  return map;
}

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const states = await fetchAgentStates(user!.id);

  return (
    <>
      <TopBar title="Agent Squad" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // team roster · {AGENTS.length} operatives
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {AGENTS.map((agent) => {
            const state = states[agent.id];
            return (
              <div
                key={agent.id}
                className="panel relative flex flex-col gap-3 p-5 transition hover:border-[color:var(--color-border-bright)]"
                style={{ borderLeft: `2px solid ${agent.color}` }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="text-2xl leading-none"
                    >
                      {agent.emoji}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{
                        backgroundColor: agent.color,
                        boxShadow: `0 0 8px ${agent.color}`,
                      }}
                    />
                  </div>
                  <span
                    className={
                      "rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider " +
                      STATE_TONE[state]
                    }
                  >
                    {STATE_LABEL[state]}
                  </span>
                </div>

                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
                    {agent.id}
                  </div>
                  <div className="mt-0.5 text-base font-semibold text-[color:var(--color-text-primary)]">
                    {agent.label}
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--color-text-secondary)]">
                    {agent.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
