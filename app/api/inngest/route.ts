import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendWinnerEmailsFunction } from "@/inngest/functions/send-winner-emails";
import { recoverWinnerEmailDispatchesFunction } from "@/inngest/functions/recover-winner-email-dispatches";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWinnerEmailsFunction, recoverWinnerEmailDispatchesFunction],
});
