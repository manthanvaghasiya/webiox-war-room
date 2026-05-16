import { TopBar } from "@/components/dashboard/topbar";
import {
  CommsTable,
  type CommRow,
  type CommsFilter,
} from "@/components/dashboard/comms-table";
import { AgentActionInline } from "@/components/dashboard/agent-action-buttons";
import { createClient } from "@/lib/supabase/server";

const VALID_FILTERS: CommsFilter[] = [
  "all",
  "outbound",
  "inbound",
  "email",
  "whatsapp",
  "queued",
  "sent",
  "replied",
  "failed",
];

function asFilter(v: string | undefined): CommsFilter {
  return v && (VALID_FILTERS as string[]).includes(v)
    ? (v as CommsFilter)
    : "all";
}

export default async function CommsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const initialFilter = asFilter(status);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user!.id;

  const { data } = await supabase
    .from("communications")
    .select(
      "id,lead_id,channel,direction,status,subject,content,language,external_id,generated_by_agent,sent_at,delivered_at,read_at,replied_at,created_at,leads(first_name,last_name,company,segment,recommended_solution)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const comms = (data as CommRow[] | null) ?? [];

  return (
    <>
      <TopBar title="Comms" />
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-text-muted)]">
            // outreach · {comms.length} message{comms.length === 1 ? "" : "s"}
          </span>
          <span className="h-px flex-1 bg-[color:var(--color-border-base)]" />
        </div>

        {comms.length === 0 ? (
          <div className="panel flex flex-col items-center justify-center gap-4 p-12 text-center">
            <p className="font-mono text-sm uppercase tracking-[0.22em] text-[color:var(--color-text-primary)]">
              No communications yet.
            </p>
            <p className="text-sm text-[color:var(--color-text-secondary)]">
              Run &lsquo;Launch Outreach Campaign&rsquo; from the dashboard.
            </p>
            <AgentActionInline
              agentId="personalizer"
              label="Launch Outreach Campaign"
            />
          </div>
        ) : (
          <CommsTable initialComms={comms} initialFilter={initialFilter} />
        )}
      </div>
    </>
  );
}
