-- =============================================================================
-- 0002_war_room_extensions.sql
-- Webiox War Room pivot: 12 agents, multi-channel comms, proposals,
-- local-business lead fields, language/channel preferences.
-- Idempotent — safe to re-run.
-- =============================================================================

-- =============================================================================
-- 1. ENUM EXTENSIONS — agent_name (add 4 truly new + ensure all 10 specialists)
-- =============================================================================
-- Note: ADD VALUE cannot run inside a transaction block in some clients; the
-- Supabase SQL Editor handles this fine. IF NOT EXISTS makes re-runs safe.
alter type agent_name add value if not exists 'lead_scout';
alter type agent_name add value if not exists 'data_enricher';
alter type agent_name add value if not exists 'lead_qualifier';
alter type agent_name add value if not exists 'personalizer';
alter type agent_name add value if not exists 'localizer';
alter type agent_name add value if not exists 'voice_dispatcher';
alter type agent_name add value if not exists 'objection_handler';
alter type agent_name add value if not exists 'appointment_setter';
alter type agent_name add value if not exists 'proposal_architect';
alter type agent_name add value if not exists 'crm_analyst';

-- =============================================================================
-- 2. NEW ENUMS
-- =============================================================================
do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_channel') then
    create type lead_channel as enum ('email', 'whatsapp', 'voice', 'multi');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_language') then
    create type lead_language as enum ('english', 'hinglish', 'gujarati', 'hindi');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_segment') then
    create type lead_segment as enum ('b2b_global', 'local_india');
  end if;

  if not exists (select 1 from pg_type where typname = 'comm_channel') then
    create type comm_channel as enum (
      'email', 'whatsapp', 'voice_call', 'sms', 'linkedin_dm'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'comm_direction') then
    create type comm_direction as enum ('outbound', 'inbound');
  end if;

  if not exists (select 1 from pg_type where typname = 'comm_status') then
    create type comm_status as enum (
      'queued', 'sending', 'sent', 'delivered', 'read', 'replied', 'failed'
    );
  end if;
end$$;

-- =============================================================================
-- 3. LEADS — add columns + indexes
-- =============================================================================
alter table public.leads add column if not exists phone              text;
alter table public.leads add column if not exists whatsapp_number    text;
alter table public.leads add column if not exists segment            lead_segment   not null default 'b2b_global';
alter table public.leads add column if not exists preferred_channel  lead_channel   not null default 'email';
alter table public.leads add column if not exists preferred_language lead_language  not null default 'english';
alter table public.leads add column if not exists lead_score         int            not null default 0;
alter table public.leads add column if not exists lead_score_reason  text;
alter table public.leads add column if not exists google_maps_url    text;
alter table public.leads add column if not exists google_rating      numeric(2,1);
alter table public.leads add column if not exists review_count       int;
alter table public.leads add column if not exists business_category  text;

create index if not exists leads_user_segment_status_idx on public.leads (user_id, segment, status);
create index if not exists leads_user_score_idx          on public.leads (user_id, lead_score desc);

-- =============================================================================
-- 4. SETTINGS — add columns
-- =============================================================================
alter table public.settings add column if not exists whatsapp_business_id   text;
alter table public.settings add column if not exists whatsapp_phone_id      text;
alter table public.settings add column if not exists whatsapp_access_token  text;
alter table public.settings add column if not exists vapi_api_key           text;
alter table public.settings add column if not exists vapi_phone_number      text;
alter table public.settings add column if not exists default_currency       text not null default 'INR';
alter table public.settings add column if not exists agency_name            text not null default 'Webiox';
alter table public.settings add column if not exists agency_logo_url        text;
alter table public.settings add column if not exists proposal_footer        text;
alter table public.settings add column if not exists supported_languages    lead_language[] not null
                                                       default array['english','hinglish','gujarati']::lead_language[];

-- =============================================================================
-- 5. NEW TABLE — communications (unified multi-channel feed)
-- =============================================================================
create table if not exists public.communications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  lead_id             uuid not null references public.leads(id)    on delete cascade,
  channel             comm_channel not null,
  direction           comm_direction not null,
  status              comm_status not null default 'queued',
  subject             text,
  content             text,
  language            lead_language not null default 'english',
  external_id         text,
  generated_by_agent  agent_name,
  metadata            jsonb not null default '{}'::jsonb,
  sent_at             timestamptz,
  delivered_at        timestamptz,
  read_at             timestamptz,
  replied_at          timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists communications_user_created_idx
  on public.communications (user_id, created_at desc);
create index if not exists communications_lead_channel_created_idx
  on public.communications (lead_id, channel, created_at desc);
create index if not exists communications_user_channel_status_idx
  on public.communications (user_id, channel, status);

alter table public.communications enable row level security;

drop policy if exists communications_select on public.communications;
drop policy if exists communications_insert on public.communications;
drop policy if exists communications_update on public.communications;
drop policy if exists communications_delete on public.communications;

create policy communications_select on public.communications
  for select using (user_id = auth.uid());
create policy communications_insert on public.communications
  for insert with check (user_id = auth.uid());
create policy communications_update on public.communications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy communications_delete on public.communications
  for delete using (user_id = auth.uid());

-- =============================================================================
-- 6. NEW TABLE — proposals (PDF quotations from Proposal Architect)
-- =============================================================================
create table if not exists public.proposals (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles(id) on delete cascade,
  lead_id             uuid not null references public.leads(id)    on delete cascade,
  deal_id             uuid references public.deals(id) on delete set null,
  title               text not null,
  scope_items         jsonb not null default '[]'::jsonb,
  total_amount        numeric(12,2) not null,
  currency            text not null default 'INR',
  language            lead_language not null default 'english',
  pdf_url             text,
  status              text not null default 'draft',  -- draft|sent|viewed|accepted|rejected
  sent_at             timestamptz,
  viewed_at           timestamptz,
  accepted_at         timestamptz,
  rejected_at         timestamptz,
  valid_until         date,
  generated_by_agent  agent_name not null default 'proposal_architect',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists proposals_user_status_idx
  on public.proposals (user_id, status);
create index if not exists proposals_lead_created_idx
  on public.proposals (lead_id, created_at desc);

drop trigger if exists set_updated_at on public.proposals;
create trigger set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

alter table public.proposals enable row level security;

drop policy if exists proposals_select on public.proposals;
drop policy if exists proposals_insert on public.proposals;
drop policy if exists proposals_update on public.proposals;
drop policy if exists proposals_delete on public.proposals;

create policy proposals_select on public.proposals
  for select using (user_id = auth.uid());
create policy proposals_insert on public.proposals
  for insert with check (user_id = auth.uid());
create policy proposals_update on public.proposals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy proposals_delete on public.proposals
  for delete using (user_id = auth.uid());

-- =============================================================================
-- 7. RE-SEED agent_status — make seed function enum-driven, backfill existing users
-- =============================================================================
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

-- Backfill: insert any missing agent rows for users who signed up before 0002.
do $$
declare
  p record;
begin
  for p in select id from public.profiles loop
    perform public.seed_default_agents(p.id);
  end loop;
end$$;

-- =============================================================================
-- DONE
-- =============================================================================
