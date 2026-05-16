import { Inngest, eventType, staticSchema } from "inngest";

// Typed events. Inngest v4 dropped `EventSchemas.fromRecord` — events are now
// declared via `eventType()` with `staticSchema()` (type-only, no runtime
// validation). Use these as triggers when creating functions and as the event
// shape when calling `inngest.send`.

export const leadScoutEvent = eventType("agent/lead_scout.run", {
  schema: staticSchema<{
    user_id?: string;
    mode?: "demo" | "apollo" | "google";
    limit?: number;
  }>(),
});

export const dataEnricherEvent = eventType("agent/data_enricher.run", {
  schema: staticSchema<{
    user_id: string;
    lead_ids?: string[];
  }>(),
});

export const leadQualifierEvent = eventType("agent/lead_qualifier.run", {
  schema: staticSchema<{
    user_id: string;
    lead_ids?: string[];
  }>(),
});

export const personalizerEvent = eventType("agent/personalizer.run", {
  schema: staticSchema<{
    user_id: string;
    lead_ids?: string[];
  }>(),
});

export const localizerEvent = eventType("agent/localizer.run", {
  schema: staticSchema<{
    user_id: string;
    communication_ids?: string[];
  }>(),
});

export const outreachManagerEvent = eventType("agent/outreach_manager.run", {
  schema: staticSchema<{
    user_id: string;
    communication_ids?: string[];
  }>(),
});

// ----- Reply pipeline (Step 9) ----------------------------------------------

// Fired by the `simulateInboundReply` server action (and, later, a real
// inbound webhook) when a lead replies to an outbound message.
export const replyReceivedEvent = eventType("lead/reply.received", {
  schema: staticSchema<{
    user_id: string;
    lead_id: string;
    comm_id: string;
    reply_text: string;
    reply_intent?: string;
  }>(),
});

export const objectionHandlerEvent = eventType("agent/objection_handler.run", {
  schema: staticSchema<{
    user_id: string;
    comm_id: string;
  }>(),
});

export const appointmentSetterEvent = eventType(
  "agent/appointment_setter.run",
  {
    schema: staticSchema<{
      user_id: string;
      lead_id: string;
      comm_id: string;
    }>(),
  },
);

// user_id optional — also runs on a daily cron across all users.
export const followupSpecialistEvent = eventType(
  "agent/followup_specialist.run",
  {
    schema: staticSchema<{
      user_id?: string;
    }>(),
  },
);

// Future events for agents 10-12 will be added here as we wire them up.

export const inngest = new Inngest({
  id: "webiox-war-room",
});
