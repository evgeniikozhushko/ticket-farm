import { inngest } from "@/inngest/client";
import { sendBulkWinnerEmails, type EmailTicket } from "@/lib/email";
import { getTicketsCollection } from "@/lib/mongodb";

export interface DrawCompletedEvent {
  name: "lottery/draw.completed";
  data: {
    orgId: string;
    date: string;
    tickets: EmailTicket[];
  };
}

/**
 * Durable background job: sends winner notification emails after a lottery draw.
 *
 * Triggered by the lottery/draw.completed event emitted from drawTodayLottery().
 * Runs outside the HTTP request path, so Vercel timeouts don't apply.
 * Inngest automatically retries on failure.
 */
export const sendWinnerEmailsFunction = inngest.createFunction(
  { id: "send-winner-emails", retries: 3 },
  { event: "lottery/draw.completed" },
  async ({ event }) => {
    const { orgId, date, tickets } = event.data;

    const emailResults = await sendBulkWinnerEmails(tickets);

    // Update ticket email status in MongoDB
    const ticketsCollection = await getTicketsCollection();
    const updates = emailResults.map((result) => ({
      updateOne: {
        filter: { orgId, date, email: result.email },
        update: {
          $set: {
            emailSent: result.success,
            emailSentAt: result.success ? new Date() : undefined,
            emailError: result.error,
          },
        },
      },
    }));

    if (updates.length > 0) {
      await ticketsCollection.bulkWrite(updates);
    }

    return {
      sent: emailResults.filter((r) => r.success).length,
      failed: emailResults.filter((r) => !r.success).length,
    };
  }
);
