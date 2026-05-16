"use client";

import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export type Tile = { label: string; value: number; tint: string };

function startOfTodayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function TopBarTiles({
  userId,
  initialTiles,
}: {
  userId: string | null;
  initialTiles: Tile[];
}) {
  const [tiles, setTiles] = useState<Tile[]>(initialTiles);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();

    async function refetch() {
      const todayISO = startOfTodayISO();
      const [leadsToday, sentToday, repliesToday, bookedToday] = await Promise.all([
        supabase
          .from("leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .gte("created_at", todayISO),
        supabase
          .from("communications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("direction", "outbound")
          .gte("sent_at", todayISO),
        supabase
          .from("communications")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .eq("direction", "inbound")
          .gte("created_at", todayISO),
        supabase
          .from("calls")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId!)
          .gte("scheduled_at", todayISO),
      ]);

      setTiles([
        { label: "Leads Today", value: leadsToday.count ?? 0, tint: "var(--color-neon-green)" },
        { label: "Sent Today",  value: sentToday.count ?? 0,  tint: "var(--color-neon-purple)" },
        { label: "Replies",     value: repliesToday.count ?? 0, tint: "var(--color-neon-amber)" },
        { label: "Booked",      value: bookedToday.count ?? 0,  tint: "var(--color-neon-green)" },
      ]);
    }

    // Debounce: realtime can spray many events; batch into one refetch.
    function invalidate() {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(refetch, 250);
    }

    const channel = supabase
      .channel("topbar_kpi_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads", filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "communications", filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls", filter: `user_id=eq.${userId}` },
        invalidate,
      )
      .subscribe();

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, [userId]);

  return (
    <div className="flex flex-1 items-center gap-3 overflow-x-auto">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="flex min-w-[120px] flex-col rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)]/60 px-3 py-2"
        >
          <span className="text-[9px] uppercase tracking-[0.22em] text-[color:var(--color-text-muted)]">
            {t.label}
          </span>
          <span
            className="font-mono-num text-xl font-semibold"
            style={{ color: t.tint }}
          >
            {t.value.toString().padStart(2, "0")}
          </span>
        </div>
      ))}
    </div>
  );
}
