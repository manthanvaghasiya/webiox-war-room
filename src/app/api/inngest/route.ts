import { serve } from "inngest/next";

import { inngest } from "@/lib/inngest/client";
import { leadScoutFn } from "@/lib/inngest/functions/lead-scout";
import { dataEnricherFn } from "@/lib/inngest/functions/data-enricher";
import { leadQualifierFn } from "@/lib/inngest/functions/lead-qualifier";
import { personalizerFn } from "@/lib/inngest/functions/personalizer";
import { localizerFn } from "@/lib/inngest/functions/localizer";
import { outreachManagerFn } from "@/lib/inngest/functions/outreach-manager";
import { objectionHandlerFn } from "@/lib/inngest/functions/objection-handler";
import { appointmentSetterFn } from "@/lib/inngest/functions/appointment-setter";
import { followupSpecialistFn } from "@/lib/inngest/functions/followup-specialist";
import { whatsappNotifierFn } from "@/lib/inngest/functions/whatsapp-notifier";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    leadScoutFn,
    dataEnricherFn,
    leadQualifierFn,
    personalizerFn,
    localizerFn,
    outreachManagerFn,
    objectionHandlerFn,
    appointmentSetterFn,
    followupSpecialistFn,
    whatsappNotifierFn,
  ],
});
