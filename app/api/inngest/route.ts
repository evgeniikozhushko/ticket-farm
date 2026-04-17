import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { sendWinnerEmailsFunction } from "@/inngest/functions/send-winner-emails";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [sendWinnerEmailsFunction],
});
