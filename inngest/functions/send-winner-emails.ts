import { inngest } from "@/inngest/client";
import { sendBulkWinnerEmails, type EmailTicket, type NonWinnerEmail } from "@/lib/email";
import { sendNonWinnerNotifications } from "@/lib/non-winner-notifications";
import { getTicketsCollection } from "@/lib/mongodb";
import { getResultEmailDispatchStatus, processResultEmailBatch } from "@/lib/result-email-delivery";
import type { Ticket } from "@/lib/types";
import type { AnyBulkWriteOperation } from "mongodb";

export interface DrawCompletedEvent {
  name: "lottery/draw.completed";
  data: {
    orgId: string;
    date: string;
    dispatchId?: string;
    tickets?: EmailTicket[];
    nonWinners?: NonWinnerEmail[];
  };
}

async function sendLegacyWinnerBatch(orgId: string, date: string, tickets: EmailTicket[]) {
  const ticketsCollection = await getTicketsCollection();
  const currentTickets = await ticketsCollection
    .find({ orgId, date, ticketId: { $in: tickets.map((ticket) => ticket.ticketId) } })
    .toArray();
  const currentTicketMap = new Map<string, Ticket>(
    currentTickets.map((ticket) => [ticket.ticketId, ticket])
  );
  const pendingTickets = tickets.filter((ticket) => {
    const current = currentTicketMap.get(ticket.ticketId);
    return current && current.emailSent !== true;
  });
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
              ...(result.messageId ? { emailMessageId: result.messageId } : {}),
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
          $set: { emailSent: false, emailError: result.error ?? "Email send failed." },
          $unset: { emailSentAt: "" },
        },
      },
    };
  });
  if (updates.length) await ticketsCollection.bulkWrite(updates);
  return {
    sent: emailResults.filter((result) => result.success).length,
    failed: emailResults.filter((result) => !result.success).length,
    skipped: tickets.length - pendingTickets.length,
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
  { id: "send-winner-emails", retries: 3, concurrency: 1 },
  { event: "lottery/draw.completed" },
  async ({ event, step }) => {
    const { orgId, date, dispatchId, tickets = [], nonWinners = [] } = event.data as DrawCompletedEvent["data"];
    if (dispatchId) {
      let afterId: string | undefined;
      let batch = 0;
      const totals = { sent: 0, failed: 0, skipped: 0, uncertain: 0 };
      const retryBatches: { cursor?: string; batch: number; failed: number }[] = [];
      while (true) {
        const cursor = afterId;
        const batchNumber = batch++;
        // Checkpoint traversal separately from retries so every eligible recipient
        // gets an attempt before an unresolved batch can fail the job.
        const result = await step.run(`result-email-batch-${batchNumber}`, () =>
          processResultEmailBatch(dispatchId, cursor)
        );
        totals.sent += result.sent;
        totals.failed += result.failed;
        totals.skipped += result.skipped;
        totals.uncertain += result.uncertain;
        if (result.failed) retryBatches.push({ cursor, batch: batchNumber, failed: result.failed });
        if (result.done) break;
        afterId = result.lastId;
      }
      for (const retry of retryBatches) {
        try {
          const result = await step.run(`result-email-retry-${retry.batch}`, async () => {
            const outcome = await processResultEmailBatch(dispatchId, retry.cursor);
            if (outcome.failed) throw new Error(`${outcome.failed} result emails failed.`);
            return outcome;
          });
          totals.failed -= retry.failed;
          totals.sent += result.sent;
          totals.uncertain += result.uncertain;
        } catch {
          // Inngest retries each failed step before surfacing its final error.
          // Continue other batches; completion checks the current database state.
        }
      }
      await step.run("result-email-completion", async () => {
        const outstanding = await getResultEmailDispatchStatus(dispatchId);
        if (outstanding.failed || outstanding.uncertain) {
          throw new Error(`${outstanding.failed} result emails failed or pending; ${outstanding.uncertain} need provider reconciliation.`);
        }
      });
      return totals;
    }
    const totals = { sent: 0, failed: 0, skipped: 0 };
    let winnerFailures = 0;
    let nonWinnerFailures = 0;
    for (let i = 0; i < tickets.length; i += 5) {
      const batch = tickets.slice(i, i + 5);
      const result = step
        ? await step.run(`legacy-winner-batch-${i / 5}`, async () => {
            const outcome = await sendLegacyWinnerBatch(orgId, date, batch);
            if (outcome.failed) throw new Error(`Failed to send ${outcome.failed} winner emails.`);
            return outcome;
          })
        : await sendLegacyWinnerBatch(orgId, date, batch);
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      winnerFailures += result.failed;
    }
    for (let i = 0; i < nonWinners.length; i += 5) {
      const batch = nonWinners.slice(i, i + 5);
      const result = step
        ? await step.run(`legacy-non-winner-batch-${i / 5}`, async () => {
            const outcome = await sendNonWinnerNotifications(orgId, date, batch);
            if (outcome.failed) throw new Error(`Failed to send ${outcome.failed} result emails.`);
            return outcome;
          })
        : await sendNonWinnerNotifications(orgId, date, batch);
      totals.sent += result.sent;
      totals.failed += result.failed;
      totals.skipped += result.skipped;
      nonWinnerFailures += result.failed;
    }
    if (nonWinnerFailures > 0) {
      throw new Error(`Failed to send ${totals.failed} result emails.`);
    }
    if (winnerFailures > 0) {
      throw new Error(
        `Failed to send ${winnerFailures} winner email${winnerFailures === 1 ? "" : "s"}.`
      );
    }
    return totals;
  }
);
