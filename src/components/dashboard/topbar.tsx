import { createClient } from "@/lib/supabase/server";
import { TopBarTiles, type Tile } from "@/components/dashboard/topbar-tiles";

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchTodayKpis(userId: string): Promise<Tile[]> {
  const supabase = await createClient();
  const todayISO = startOfTodayISO();
  const [leadsToday, sentToday, repliesToday, bookedToday] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", todayISO),
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("direction", "outbound")
      .gte("sent_at", todayISO),
    supabase
      .from("communications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("direction", "inbound")
      .gte("created_at", todayISO),
    supabase
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("scheduled_at", todayISO),
  ]);

  return [
    { label: "Leads Today", value: leadsToday.count ?? 0, tint: "var(--color-neon-green)" },
    { label: "Sent Today",  value: sentToday.count ?? 0,  tint: "var(--color-neon-purple)" },
    { label: "Replies",     value: repliesToday.count ?? 0, tint: "var(--color-neon-amber)" },
    { label: "Booked",      value: bookedToday.count ?? 0,  tint: "var(--color-neon-green)" },
  ];
}

export async function TopBar({ title = "Command Center" }: { title?: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const tiles = user
    ? await fetchTodayKpis(user.id)
    : ([
        { label: "Leads Today", value: 0, tint: "var(--color-neon-green)" },
        { label: "Sent Today", value: 0, tint: "var(--color-neon-purple)" },
        { label: "Replies", value: 0, tint: "var(--color-neon-amber)" },
        { label: "Booked", value: 0, tint: "var(--color-neon-green)" },
      ] as Tile[]);

  return (
    <header className="flex h-16 items-center gap-6 border-b border-[color:var(--color-border-base)] bg-[color:var(--color-bg-panel)]/60 px-6 backdrop-blur">
      <div className="min-w-[180px]">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
          // module
        </div>
        <h1 className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
          {title}
        </h1>
      </div>

      <TopBarTiles userId={user?.id ?? null} initialTiles={tiles} />

      <div className="flex items-center gap-2 rounded-full border border-[color:var(--color-neon-green-dim)] bg-[color:var(--color-neon-green-dim)]/30 px-3 py-1.5">
        <span
          aria-hidden
          className="pulse-glow h-1.5 w-1.5 rounded-full bg-[color:var(--color-neon-green)] text-[color:var(--color-neon-green)]"
        />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[color:var(--color-neon-green)]">
          System Status: Operational
        </span>
      </div>
    </header>
  );
}
