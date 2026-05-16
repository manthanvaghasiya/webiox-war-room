// Hand-written row types for the Supabase schema in
// `supabase/migrations/0001_initial_schema.sql` and `0002_war_room_extensions.sql`.
// snake_case to match Postgres. Replace with `supabase gen types typescript` later.

// ===== Enums =================================================================

export type LeadStatus =
  | 'new'
  | 'enriching'
  | 'contacted'
  | 'replied'
  | 'qualified'
  | 'not_interested'
  | 'invalid'
  | 'cold';

export type QualifiedStatus =
  | 'new'
  | 'call_booked'
  | 'call_completed'
  | 'proposal_sent'
  | 'negotiating'
  | 'closed_won'
  | 'closed_lost';

export type DealStage =
  | 'proposal'
  | 'negotiation'
  | 'verbal_yes'
  | 'contract_sent'
  | 'closed_won'
  | 'closed_lost';

// Consolidated to exactly 12 War-Room agents in migration 0003.
// Order matches the Postgres enum order (display order in the UI sidebar).
export type AgentName =
  | 'lead_scout'
  | 'data_enricher'
  | 'lead_qualifier'
  | 'personalizer'
  | 'localizer'
  | 'outreach_manager'
  | 'followup_specialist'
  | 'objection_handler'
  | 'appointment_setter'
  | 'voice_dispatcher'
  | 'proposal_architect'
  | 'crm_analyst';

export interface AgentMeta {
  id: AgentName;
  label: string;
  emoji: string;
  color: string;
  description: string;
}

export const AGENTS = [
  { id: 'lead_scout',          label: 'Lead Scout',           emoji: '🔍', color: '#00ff88', description: 'Finds new leads' },
  { id: 'data_enricher',       label: 'Data Enricher',        emoji: '📊', color: '#00ff88', description: 'Verifies & enriches contact data' },
  { id: 'lead_qualifier',      label: 'Lead Qualifier',       emoji: '🎯', color: '#00ff88', description: 'Scores leads 0-100' },
  { id: 'personalizer',        label: 'Personalizer',         emoji: '✍️', color: '#a855f7', description: 'Writes personalized outreach' },
  { id: 'localizer',           label: 'Localizer',            emoji: '🌐', color: '#a855f7', description: 'Translates to Hinglish/Gujarati' },
  { id: 'outreach_manager',    label: 'Outreach Manager',     emoji: '📤', color: '#a855f7', description: 'Sends email & WhatsApp' },
  { id: 'followup_specialist', label: 'Follow-up Specialist', emoji: '🔁', color: '#a855f7', description: 'Day 3/7/14 follow-ups' },
  { id: 'objection_handler',   label: 'Objection Handler',    emoji: '🛡️', color: '#fbbf24', description: 'Reads replies, handles objections' },
  { id: 'appointment_setter',  label: 'Appointment Setter',   emoji: '📅', color: '#fbbf24', description: 'Books meetings via Calendly' },
  { id: 'voice_dispatcher',    label: 'Voice Dispatcher',     emoji: '📞', color: '#fbbf24', description: 'Outbound voice calls (Vapi)' },
  { id: 'proposal_architect',  label: 'Proposal Architect',   emoji: '📄', color: '#fbbf24', description: 'Generates PDF quotations' },
  { id: 'crm_analyst',         label: 'CRM Analyst',          emoji: '📈', color: '#fbbf24', description: 'Daily reports & pipeline health' },
] as const satisfies readonly AgentMeta[];

export type AgentState = 'idle' | 'running' | 'error' | 'paused';

export type EmailDirection = 'outbound' | 'inbound';

export type EmailClassification =
  | 'interested'
  | 'not_interested'
  | 'objection'
  | 'question'
  | 'out_of_office'
  | 'unclassified';

export type CallStatus = 'booked' | 'completed' | 'no_show' | 'cancelled';

export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export type ClientStatus = 'active' | 'churned' | 'paused';

// ----- Added in 0002 ---------------------------------------------------------

export type LeadChannel = 'email' | 'whatsapp' | 'voice' | 'multi';

export type LeadLanguage = 'english' | 'hinglish' | 'gujarati' | 'hindi';

export type LeadSegment = 'b2b_global' | 'local_india';

// ----- Added in 0004 ---------------------------------------------------------

export type SolutionType =
  | 'website'
  | 'mobile_app'
  | 'crm'
  | 'automation'
  | 'multi'
  | 'none';

// Display metadata for the UI. Order here is the order shown in the
// dashboard's SOLUTION OPPORTUNITIES row and the /leads filter pill bar.
export const SOLUTIONS: {
  id: SolutionType;
  emoji: string;
  label: string;
  color: string;
}[] = [
  { id: 'website',    emoji: '🌐', label: 'Website',        color: '#00ff88' },
  { id: 'mobile_app', emoji: '📱', label: 'Mobile App',     color: '#a855f7' },
  { id: 'crm',        emoji: '🏥', label: 'CRM',            color: '#fbbf24' },
  { id: 'automation', emoji: '🤖', label: 'Automation',     color: '#00ffff' },
  { id: 'multi',      emoji: '🎯', label: 'Multi-Solution', color: '#ff3366' },
  { id: 'none',       emoji: '—',  label: 'No Fit',         color: '#4a6560' },
];

export type CommChannel =
  | 'email'
  | 'whatsapp'
  | 'voice_call'
  | 'sms'
  | 'linkedin_dm';

export type CommDirection = 'outbound' | 'inbound';

export type CommStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'read'
  | 'replied'
  | 'failed';

export type ProposalStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'rejected';

// ===== Tables ================================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  created_at: string;
}

export interface Settings {
  id: string;
  user_id: string;
  icp_job_titles: string[];
  icp_industries: string[];
  icp_company_size_min: number;
  icp_company_size_max: number;
  icp_locations: string[];
  daily_lead_limit: number;
  daily_email_limit: number;
  sender_name: string | null;
  sender_email: string | null;
  calendly_url: string | null;
  custom_sdr_prompt: string | null;
  custom_ae_prompt: string | null;
  apollo_search_id: string | null;
  created_at: string;
  updated_at: string;

  // added in 0002
  whatsapp_business_id: string | null;
  whatsapp_phone_id: string | null;
  whatsapp_access_token: string | null;
  vapi_api_key: string | null;
  vapi_phone_number: string | null;
  default_currency: string;
  agency_name: string;
  agency_logo_url: string | null;
  proposal_footer: string | null;
  supported_languages: LeadLanguage[];
}

export interface Lead {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string | null;
  email_verified: boolean;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  website: string | null;
  industry: string | null;
  company_size: number | null;
  location: string | null;
  source: string;
  status: LeadStatus;
  assigned_agent: AgentName | null;
  research_note: string | null;
  last_contacted_at: string | null;
  reply_count: number;
  created_at: string;
  updated_at: string;

  // added in 0002
  phone: string | null;
  whatsapp_number: string | null;
  segment: LeadSegment;
  preferred_channel: LeadChannel;
  preferred_language: LeadLanguage;
  lead_score: number;
  lead_score_reason: string | null;
  google_maps_url: string | null;
  google_rating: number | null;
  review_count: number | null;
  business_category: string | null;

  // added in 0004
  address: string | null;
  recommended_solution: SolutionType | null;
  solution_reason: string | null;
}

export interface QualifiedLead {
  id: string;
  lead_id: string | null;
  user_id: string;
  qualification_reason: string | null;
  pain_points: string[] | null;
  budget_signal: string | null;
  status: QualifiedStatus;
  calendly_link_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface EmailMessage {
  id: string;
  user_id: string;
  lead_id: string | null;
  direction: EmailDirection;
  subject: string | null;
  body: string | null;
  from_email: string | null;
  to_email: string | null;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  resend_message_id: string | null;
  classification: EmailClassification;
  classification_reason: string | null;
  generated_by_agent: AgentName | null;
  created_at: string;
}

export interface Call {
  id: string;
  user_id: string;
  lead_id: string | null;
  qualified_lead_id: string | null;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string | null;
  status: CallStatus;
  transcript: string | null;
  summary: string | null;
  next_steps: string | null;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  user_id: string;
  lead_id: string | null;
  qualified_lead_id: string | null;
  company: string;
  contact_name: string | null;
  deal_value: number;
  stage: DealStage;
  proposal_sent_at: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  user_id: string;
  deal_id: string | null;
  company: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  monthly_value: number | null;
  start_date: string;
  status: ClientStatus | string;
  nps_score: number | null;
  last_checkin_at: string | null;
  notion_workspace_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentLog {
  id: string;
  user_id: string;
  agent: AgentName;
  action: string;
  target_table: string | null;
  target_id: string | null;
  level: LogLevel;
  message: string | null;
  metadata: Record<string, unknown>;
  tokens_used: number | null;
  cost_usd: number | null;
  created_at: string;
}

export interface AgentStatus {
  id: string;
  user_id: string;
  agent: AgentName;
  state: AgentState;
  current_task: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  total_runs: number;
  total_errors: number;
}

// ----- Added in 0002 ---------------------------------------------------------

export interface Communication {
  id: string;
  user_id: string;
  lead_id: string;
  channel: CommChannel;
  direction: CommDirection;
  status: CommStatus;
  subject: string | null;
  content: string | null;
  language: LeadLanguage;
  external_id: string | null;
  generated_by_agent: AgentName | null;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface ProposalScopeItem {
  item: string;
  description?: string;
  price: number;
}

export interface Proposal {
  id: string;
  user_id: string;
  lead_id: string;
  deal_id: string | null;
  title: string;
  scope_items: ProposalScopeItem[];
  total_amount: number;
  currency: string;
  language: LeadLanguage;
  pdf_url: string | null;
  status: ProposalStatus | string;
  sent_at: string | null;
  viewed_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  valid_until: string | null;
  generated_by_agent: AgentName;
  created_at: string;
  updated_at: string;
}

// ===== Aggregate Database type (Supabase-compatible shape) ==================

export type Database = {
  public: {
    Tables: {
      profiles: { Row: Profile };
      settings: { Row: Settings };
      leads: { Row: Lead };
      qualified_leads: { Row: QualifiedLead };
      email_messages: { Row: EmailMessage };
      calls: { Row: Call };
      deals: { Row: Deal };
      clients: { Row: Client };
      agent_logs: { Row: AgentLog };
      agent_status: { Row: AgentStatus };
      communications: { Row: Communication };
      proposals: { Row: Proposal };
    };
    Views: Record<string, never>;
    Functions: {
      seed_default_agents: { Args: { p_user_id: string }; Returns: void };
    };
    Enums: {
      lead_status: LeadStatus;
      qualified_status: QualifiedStatus;
      deal_stage: DealStage;
      agent_name: AgentName;
      agent_state: AgentState;
      email_direction: EmailDirection;
      email_classification: EmailClassification;
      call_status: CallStatus;
      log_level: LogLevel;
      lead_channel: LeadChannel;
      lead_language: LeadLanguage;
      lead_segment: LeadSegment;
      comm_channel: CommChannel;
      comm_direction: CommDirection;
      comm_status: CommStatus;
      solution_type: SolutionType;
    };
  };
};
