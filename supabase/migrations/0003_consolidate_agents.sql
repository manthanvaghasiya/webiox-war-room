-- =============================================================================
-- 0003_consolidate_agents.sql
-- Collapse agent_name from 18 values down to exactly 12 War-Room agents.
--
-- Postgres does not allow REMOVING enum values, so we:
--   1. wipe agent_status + agent_logs (confirmed empty)
--   2. NULL soft-FK columns on tables that reference agent_name
--   3. create agent_name_v2 with the canonical 12 values in display order
--   4. ALTER each column TYPE to agent_name_v2 USING NULL
--   5. DROP old enum, RENAME v2 -> agent_name
--   6. re-seed agent_status for every existing profile
--
-- Idempotent enough to re-run on a fresh DB; not idempotent across partial
-- runs (the rename is destructive). Wrapped in a single transaction so a
-- mid-migration failure leaves the schema untouched.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Wipe agent_status and agent_logs.
-- ---------------------------------------------------------------------------
truncate table public.agent_status restart identity;
truncate table public.agent_logs   restart identity;

-- ---------------------------------------------------------------------------
-- 2. NULL out soft-FK agent columns on every other table.
--    IF EXISTS guards keep this safe if migration 0002 didn't apply.
-- ---------------------------------------------------------------------------
do $$
begin
  -- leads.assigned_agent (nullable)
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='leads' and column_name='assigned_agent'
  ) then
    update public.leads set assigned_agent = null;
  end if;

  -- email_messages.generated_by_agent (nullable)
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='email_messages' and column_name='generated_by_agent'
  ) then
    update public.email_messages set generated_by_agent = null;
  end if;

  -- communications.generated_by_agent (nullable, from 0002)
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='communications' and column_name='generated_by_agent'
  ) then
    update public.communications set generated_by_agent = null;
  end if;

  -- proposals.generated_by_agent (NOT NULL with default in 0002 — relax both
  -- so we can null it out; re-tightened at the end of this migration).
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proposals' and column_name='generated_by_agent'
  ) then
    alter table public.proposals alter column generated_by_agent drop default;
    alter table public.proposals alter column generated_by_agent drop not null;
    update public.proposals set generated_by_agent = null;
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 3. Create the new enum with exactly 12 values in display order.
--    Enum order is preserved by Postgres and is useful for `order by` in the UI.
-- ---------------------------------------------------------------------------
create type agent_name_v2 as enum (
  'lead_scout',
  'data_enricher',
  'lead_qualifier',
  'personalizer',
  'localizer',
  'outreach_manager',
  'followup_specialist',
  'objection_handler',
  'appointment_setter',
  'voice_dispatcher',
  'proposal_architect',
  'crm_analyst'
);

-- ---------------------------------------------------------------------------
-- 4. Swap every column's type from agent_name -> agent_name_v2.
--    All rows have been nulled (or the table truncated) so USING NULL is safe.
-- ---------------------------------------------------------------------------

-- agent_status.agent (NOT NULL, but agent_status was truncated above)
alter table public.agent_status
  alter column agent type agent_name_v2 using null::agent_name_v2;

-- agent_logs.agent (NOT NULL, but agent_logs was truncated above)
alter table public.agent_logs
  alter column agent type agent_name_v2 using null::agent_name_v2;

-- leads.assigned_agent (nullable)
alter table public.leads
  alter column assigned_agent type agent_name_v2 using null::agent_name_v2;

-- email_messages.generated_by_agent (nullable)
alter table public.email_messages
  alter column generated_by_agent type agent_name_v2 using null::agent_name_v2;

-- communications.generated_by_agent (nullable, only exists if 0002 ran)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='communications' and column_name='generated_by_agent'
  ) then
    execute 'alter table public.communications
               alter column generated_by_agent type agent_name_v2 using null::agent_name_v2';
  end if;
end$$;

-- proposals.generated_by_agent (only exists if 0002 ran; default already dropped above)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proposals' and column_name='generated_by_agent'
  ) then
    execute 'alter table public.proposals
               alter column generated_by_agent type agent_name_v2 using null::agent_name_v2';
  end if;
end$$;

-- ---------------------------------------------------------------------------
-- 5. Drop the old enum and rename v2 in its place.
-- ---------------------------------------------------------------------------
drop type agent_name;
alter type agent_name_v2 rename to agent_name;

-- ---------------------------------------------------------------------------
-- 6. Recreate seed_default_agents (enum-driven — picks up the new 12 values).
-- ---------------------------------------------------------------------------
create or replace function public.seed_default_agents(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_status (user_id, agent, state)
  select p_user_id, unnest(enum_range(null::agent_name)), 'idle'::agent_state
  on conflict (user_id, agent) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Backfill: seed all 12 agents for every existing profile.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select id from public.profiles loop
    perform public.seed_default_agents(r.id);
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 8. Re-tighten proposals.generated_by_agent: backfill nulls, restore default
--    and NOT NULL. (Only if the table/column actually exists.)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='proposals' and column_name='generated_by_agent'
  ) then
    update public.proposals
       set generated_by_agent = 'proposal_architect'::agent_name
     where generated_by_agent is null;

    alter table public.proposals
      alter column generated_by_agent set default 'proposal_architect'::agent_name;

    alter table public.proposals
      alter column generated_by_agent set not null;
  end if;
end$$;

commit;

-- =============================================================================
-- Verification (run manually after the migration body commits):
-- =============================================================================
-- SELECT unnest(enum_range(NULL::agent_name))::text AS agent ORDER BY 1;
-- SELECT COUNT(*) FROM agent_status;  -- should equal (#profiles) * 12
