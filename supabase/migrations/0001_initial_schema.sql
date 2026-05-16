-- =============================================================================
-- 0001_initial_schema.sql
-- Agency Dashboard — initial schema, RLS, indexes, triggers, seed function.
-- Run this in the Supabase SQL Editor.
-- =============================================================================

-- Extensions ------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- =============================================================================
-- ENUMS
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type lead_status as enum (
      'new', 'enriching', 'contacted', 'replied',
      'qualified', 'not_interested', 'invalid', 'cold'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'qualified_status') then
    create type qualified_status as enum (
      'new', 'call_booked', 'call_completed',
      'proposal_sent', 'negotiating', 'closed_won', 'closed_lost'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'deal_stage') then
    create type deal_stage as enum (
      'proposal', 'negotiation', 'verbal_yes',
      'contract_sent', 'closed_won', 'closed_lost'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_name') then
    create type agent_name as enum (
      'bdr', 'sdr', 'ae', 'account_manager',
      'csm', 'sales_director', 'sales_manager', 'sales_ops'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'agent_state') then
    create type agent_state as enum ('idle', 'running', 'error', 'paused');
  end if;

  if not exists (select 1 from pg_type where typname = 'email_direction') then
    create type email_direction as enum ('outbound', 'inbound');
  end if;

  if not exists (select 1 from pg_type where typname = 'email_classification') then
    create type email_classification as enum (
      'interested', 'not_interested', 'objection',
      'question', 'out_of_office', 'unclassified'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'call_status') then
    create type call_status as enum ('booked', 'completed', 'no_show', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'log_level') then
    create type log_level as enum ('info', 'success', 'warning', 'error');
  end if;
end$$;

-- =============================================================================
-- TABLES
-- =============================================================================

-- 1. profiles ----------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  company_name text,
  created_at   timestamptz not null default now()
);

-- 2. settings ----------------------------------------------------------------
create table if not exists public.settings (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null unique references public.profiles(id) on delete cascade,
  icp_job_titles        text[] not null default '{}',
  icp_industries        text[] not null default '{}',
  icp_company_size_min  int not null default 10,
  icp_company_size_max  int not null default 500,
  icp_locations         text[] not null default '{}',
  daily_lead_limit      int not null default 50,
  daily_email_limit     int not null default 30,
  sender_name           text,
  sender_email          text,
  calendly_url          text,
  custom_sdr_prompt     text,
  custom_ae_prompt      text,
  apollo_search_id      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- 3. leads -------------------------------------------------------------------
create table if not exists public.leads (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  first_name        text,
  last_name         text,
  full_name         text generated always as (
                      trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))
                    ) stored,
  email             text,
  email_verified    boolean not null default false,
  company           text,
  job_title         text,
  linkedin_url      text,
  website           text,
  industry          text,
  company_size      int,
  location          text,
  source            text not null default 'apollo',
  status            lead_status not null default 'new',
  assigned_agent    agent_name,
  research_note     text,
  last_contacted_at timestamptz,
  reply_count       int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, email)
);

-- 4. qualified_leads ---------------------------------------------------------
create table if not exists public.qualified_leads (
  id                   uuid primary key default gen_random_uuid(),
  lead_id              uuid unique references public.leads(id) on delete cascade,
  user_id              uuid not null references public.profiles(id) on delete cascade,
  qualification_reason text,
  pain_points          text[],
  budget_signal        text,
  status               qualified_status not null default 'new',
  calendly_link_sent   boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 5. email_messages ----------------------------------------------------------
create table if not exists public.email_messages (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  lead_id               uuid references public.leads(id) on delete cascade,
  direction             email_direction not null,
  subject               text,
  body                  text,
  from_email            text,
  to_email              text,
  sent_at               timestamptz,
  opened_at             timestamptz,
  replied_at            timestamptz,
  resend_message_id     text,
  classification        email_classification not null default 'unclassified',
  classification_reason text,
  generated_by_agent    agent_name,
  created_at            timestamptz not null default now()
);

-- 6. calls -------------------------------------------------------------------
create table if not exists public.calls (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  lead_id           uuid references public.leads(id) on delete cascade,
  qualified_lead_id uuid references public.qualified_leads(id) on delete set null,
  scheduled_at      timestamptz not null,
  duration_minutes  int not null default 30,
  meeting_url       text,
  status            call_status not null default 'booked',
  transcript        text,
  summary           text,
  next_steps        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 7. deals -------------------------------------------------------------------
create table if not exists public.deals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  lead_id             uuid references public.leads(id) on delete cascade,
  qualified_lead_id   uuid references public.qualified_leads(id) on delete set null,
  company             text not null,
  contact_name        text,
  deal_value          numeric(12,2) not null default 0,
  stage               deal_stage not null default 'proposal',
  proposal_sent_at    timestamptz,
  expected_close_date date,
  closed_at           timestamptz,
  lost_reason         text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- 8. clients -----------------------------------------------------------------
create table if not exists public.clients (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  deal_id                uuid references public.deals(id) on delete set null,
  company                text not null,
  primary_contact_name   text,
  primary_contact_email  text,
  monthly_value          numeric(12,2),
  start_date             date not null default current_date,
  status                 text not null default 'active',   -- active | churned | paused
  nps_score              int,
  last_checkin_at        timestamptz,
  notion_workspace_url   text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- 9. agent_logs --------------------------------------------------------------
create table if not exists public.agent_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  agent        agent_name not null,
  action       text not null,
  target_table text,
  target_id    uuid,
  level        log_level not null default 'info',
  message      text,
  metadata     jsonb not null default '{}'::jsonb,
  tokens_used  int,
  cost_usd     numeric(8,4),
  created_at   timestamptz not null default now()
);

-- 10. agent_status -----------------------------------------------------------
create table if not exists public.agent_status (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  agent         agent_name not null,
  state         agent_state not null default 'idle',
  current_task  text,
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  total_runs    int not null default 0,
  total_errors  int not null default 0,
  unique (user_id, agent)
);

-- =============================================================================
-- INDEXES
-- =============================================================================
create index if not exists leads_user_status_idx          on public.leads (user_id, status);
create index if not exists leads_user_created_at_idx      on public.leads (user_id, created_at desc);
create index if not exists leads_email_idx                on public.leads (email);

create index if not exists qualified_leads_user_status_idx on public.qualified_leads (user_id, status);
create index if not exists qualified_leads_lead_idx        on public.qualified_leads (lead_id);

create index if not exists email_messages_lead_sent_idx   on public.email_messages (lead_id, sent_at desc);
create index if not exists email_messages_user_dir_idx    on public.email_messages (user_id, direction, created_at desc);

create index if not exists calls_user_scheduled_idx       on public.calls (user_id, scheduled_at);
create index if not exists calls_lead_idx                 on public.calls (lead_id);

create index if not exists deals_user_stage_idx           on public.deals (user_id, stage);
create index if not exists deals_user_created_idx         on public.deals (user_id, created_at desc);

create index if not exists agent_logs_user_created_idx    on public.agent_logs (user_id, created_at desc);
create index if not exists agent_logs_agent_created_idx   on public.agent_logs (agent, created_at desc);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- set_updated_at -------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['settings','leads','qualified_leads','calls','deals','clients']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t
    );
  end loop;
end$$;

-- seed_default_agents --------------------------------------------------------
create or replace function public.seed_default_agents(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.agent_status (user_id, agent, state)
  select p_user_id, a, 'idle'::agent_state
  from unnest(enum_range(null::agent_name)) as a
  on conflict (user_id, agent) do nothing;
end;
$$;

-- handle_new_user ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;

  perform public.seed_default_agents(new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- RLS — enable + policies
-- =============================================================================

alter table public.profiles        enable row level security;
alter table public.settings        enable row level security;
alter table public.leads           enable row level security;
alter table public.qualified_leads enable row level security;
alter table public.email_messages  enable row level security;
alter table public.calls           enable row level security;
alter table public.deals           enable row level security;
alter table public.clients         enable row level security;
alter table public.agent_logs      enable row level security;
alter table public.agent_status    enable row level security;

-- profiles (keyed on id, not user_id) ----------------------------------------
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;

create policy profiles_select on public.profiles for select using (id = auth.uid());
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_delete on public.profiles for delete using (id = auth.uid());

-- Generic user_id policies for every other table ----------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'settings','leads','qualified_leads','email_messages',
    'calls','deals','clients','agent_logs','agent_status'
  ]
  loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('drop policy if exists %I_insert on public.%I', t, t);
    execute format('drop policy if exists %I_update on public.%I', t, t);
    execute format('drop policy if exists %I_delete on public.%I', t, t);

    execute format(
      'create policy %I_select on public.%I
         for select using (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_insert on public.%I
         for insert with check (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_update on public.%I
         for update using (user_id = auth.uid()) with check (user_id = auth.uid())', t, t);
    execute format(
      'create policy %I_delete on public.%I
         for delete using (user_id = auth.uid())', t, t);
  end loop;
end$$;

-- =============================================================================
-- DONE
-- =============================================================================
