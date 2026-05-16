import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/dashboard/sidebar";
import { AGENTS, type AgentName, type AgentState } from "@/types/database";

async function fetchInitialAgentStates(
  userId: string,
): Promise<Record<AgentName, AgentState>> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("agent_status")
    .select("agent,state")
    .eq("user_id", userId);

  const map = Object.fromEntries(
    AGENTS.map((a) => [a.id, "idle" as AgentState]),
  ) as Record<AgentName, AgentState>;
  (data ?? []).forEach((row: { agent: AgentName; state: AgentState }) => {
    map[row.agent] = row.state;
  });
  return map;
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // proxy.ts handles redirects, but be defensive in case the matcher misses.
  if (!user) redirect("/login");

  const initialStates = await fetchInitialAgentStates(user.id);

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userId={user.id}
        userEmail={user.email ?? null}
        initialStates={initialStates}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>

      {/* Right-rail slot — collapsible LiveAgentPanel lands here in Step 5. */}
      <aside
        aria-hidden
        className="hidden w-0 border-l border-[color:var(--color-neon-green-dim)] xl:block"
      />
    </div>
  );
}
