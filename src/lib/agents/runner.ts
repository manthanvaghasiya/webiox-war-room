import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AgentName, LogLevel } from "@/types/database";

// Service-role client — bypasses RLS. NEVER import this into a Client Component.
export const supabaseAdmin: SupabaseClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

export type LogOptions = {
  level?: LogLevel;
  action?: string;
  target_table?: string;
  target_id?: string;
  metadata?: Record<string, unknown>;
  tokens?: number;
  cost?: number;
};

export type AgentContext = {
  userId: string;
  agentName: AgentName;
  supabase: SupabaseClient;
  log: (message: string, opts?: LogOptions) => Promise<void>;
};

export async function runAgent<T>(
  agentName: AgentName,
  userId: string,
  task: string,
  fn: (ctx: AgentContext) => Promise<T>,
): Promise<T> {
  const startTime = Date.now();

  const log: AgentContext["log"] = async (message, opts = {}) => {
    await supabaseAdmin.from("agent_logs").insert({
      user_id: userId,
      agent: agentName,
      action: opts.action ?? "log",
      target_table: opts.target_table ?? null,
      target_id: opts.target_id ?? null,
      level: opts.level ?? "info",
      message,
      metadata: opts.metadata ?? {},
      tokens_used: opts.tokens ?? null,
      cost_usd: opts.cost ?? null,
    });
  };

  await supabaseAdmin.from("agent_status").upsert(
    {
      user_id: userId,
      agent: agentName,
      state: "running",
      current_task: task,
      last_run_at: new Date().toISOString(),
    },
    { onConflict: "user_id,agent" },
  );
  await log(`Agent started: ${task}`, { action: "start", level: "info" });

  try {
    const result = await fn({ userId, agentName, supabase: supabaseAdmin, log });

    await supabaseAdmin.from("agent_status").upsert(
      {
        user_id: userId,
        agent: agentName,
        state: "idle",
        current_task: null,
        last_run_at: new Date().toISOString(),
      },
      { onConflict: "user_id,agent" },
    );

    // Best-effort run counter increment. RPC may not exist yet; swallow errors.
    try {
      await supabaseAdmin.rpc("increment_agent_runs", {
        p_user_id: userId,
        p_agent: agentName,
      });
    } catch {
      // ignored
    }

    await log(`Agent finished in ${Date.now() - startTime}ms`, {
      action: "complete",
      level: "success",
    });
    return result;
  } catch (err) {
    const e = err as Error;
    await supabaseAdmin.from("agent_status").upsert(
      {
        user_id: userId,
        agent: agentName,
        state: "error",
        current_task: `Error: ${e.message}`,
      },
      { onConflict: "user_id,agent" },
    );
    await log(`Agent failed: ${e.message}`, {
      action: "error",
      level: "error",
      metadata: { stack: e.stack },
    });
    throw err;
  }
}
