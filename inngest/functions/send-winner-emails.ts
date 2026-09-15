import { inngest } from "@/inngest/client";
import { sendBulkWinnerEmails, type EmailTicket, type NonWinnerEmail } from "@/lib/email";
import { sendNonWinnerNotifications } from "@/lib/non-winner-notifications";
import { getTicketsCollection } from "@/lib/mongodb";
import type { Ticket } from "@/lib/types";
import type { AnyBulkWriteOperation } from "mongodb";

export interface DrawCompletedEvent {
  name: "lottery/draw.completed";
  data: {
    orgId: string;
    date: string;
    tickets: EmailTicket[];
    nonWinners?: NonWinnerEmail[];
  };
}

/**
 * Durable background job: sends winner notification emails after a lottery draw.
 *
 * Triggered by the lottery/draw.completed event emitted from drawTodayLottery().
 * Sends the recipient snapshot committed by the draw transaction.
 * Inngest automatically retries on failure.
 */
export const sendWinnerEmailsFunction = inngest.createFunction(
  { id: "send-winner-emails", retries: 3 },
  { event: "lottery/draw.completed" },
  async ({ event }) => {
    const { orgId, date, tickets, nonWinners = [] } = event.data as DrawCompletedEvent["data"];
    const ticketIds = tickets.map((ticket: EmailTicket) => ticket.ticketId);
    const ticketsCollection = await getTicketsCollection();

    const currentTickets = await ticketsCollection
      .find({ orgId, date, ticketId: { $in: ticketIds } })
      .toArray();
    const currentTicketMap = new Map<string, Ticket>(
      currentTickets.map((ticket) => [ticket.ticketId, ticket])
    );

    const pendingTickets = tickets.filter((ticket: EmailTicket) => {
      const current = currentTicketMap.get(ticket.ticketId);
      return current && current.emailSent !== true;
    });

    if (pendingTickets.length === 0 && nonWinners.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: tickets.length,
      };
    }

    const emailResults = pendingTickets.length ? await sendBulkWinnerEmails(pendingTickets) : [];

    const updates = emailResults.map((result, index): AnyBulkWriteOperation<Ticket> => {
      if (result.success) {
        return {
          updateOne: {
            filter: { orgId, date, ticketId: pendingTickets[index].ticketId, emailSent: { $ne: true } },
            update: {
              $set: {
                emailSent: true,
                emailSentAt: new Date(),
              },
              $unset: { emailError: "" },
            },
          },
        };
      }

      return {
        updateOne: {
          filter: { orgId, date, ticketId: pendingTickets[index].ticketId, emailSent: { $ne: true } },
          update: {
            $set: {
              emailSent: false,
              emailError: result.error ?? "Email send failed.",
            },
            $unset: { emailSentAt: "" },
          },
        },
      };
    });

    if (updates.length > 0) {
      await ticketsCollection.bulkWrite(updates);
    }

    const failed = emailResults.filter((r) => !r.success);
    const nonWinnerCounts = await sendNonWinnerNotifications(orgId, date, nonWinners);
    if (nonWinnerCounts.failed > 0) {
      throw new Error(`Failed to send ${failed.length + nonWinnerCounts.failed} result emails.`);
    }
    if (failed.length > 0) {
      throw new Error(
        `Failed to send ${failed.length} winner email${failed.length === 1 ? "" : "s"}.`
      );
    }

    return {
      sent: emailResults.filter((r) => r.success).length + nonWinnerCounts.sent,
      failed: 0,
      skipped: tickets.length - pendingTickets.length + nonWinnerCounts.skipped,
    };
  }
);
