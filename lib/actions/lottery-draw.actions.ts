"use server";

import { randomInt } from "crypto";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import {
  getClient,
  getEmailDispatchesCollection,
  getResultEmailRecipientsCollection,
  getRegistrantsCollection,
  getLotteriesCollection,
  getTicketsCollection,
  getParticipantSummariesCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type {
  DrawLotteryResult,
  RetryWinnerEmailsResult,
  WinnerInfo,
  Registrant,
  Ticket,
} from "@/lib/types";
import { requireRole, requireActiveSub } from "@/lib/authz";
import { getOrganization } from "@/lib/orgs";
import { dispatchWinnerEmailEvent } from "@/lib/email-dispatch-outbox";
import { duplicateErrorIncludesField, isDuplicateKeyError } from "@/lib/mongo-errors";
import type { EmailTicket } from "@/lib/email";
import { DEFAULT_PICKUP_TIME } from "@/lib/pickup";
import { recordWinnerTickets } from "@/lib/participant-summaries";

const TICKET_ID_LENGTH = 12;
const TICKET_ID_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateTicketId(): string {
  return Array.from({ length: TICKET_ID_LENGTH }, () =>
    TICKET_ID_ALPHABET[randomInt(TICKET_ID_ALPHABET.length)]
  ).join("");
}

class DrawUserError extends Error {}

function isTicketIdDuplicateKeyError(err: unknown): boolean {
  return isDuplicateKeyError(err) && duplicateErrorIncludesField(err, "ticketId");
}

function buildTicketDocuments(input: {
  orgId: string;
  selectedWinners: Registrant[];
  date: string;
  drawnAt: Date;
  pickupTime: string;
}): Omit<Ticket, "_id">[] {
  return input.selectedWinners.map((winner, index) => ({
    orgId: input.orgId,
    ticketNumber: index + 1,
    ticketId: generateTicketId(),
    name: winner.name,
    email: winner.email,
    date: input.date,
    pickupTime: input.pickupTime,
    status: "ACTIVE",
    generatedAt: input.drawnAt,
  }));
}

function buildEmailTickets(input: {
  tickets: Omit<Ticket, "_id">[] | Ticket[];
  orgName: string;
  pickupLocation?: string;
  emailFromAddress: string;
  emailFromName: string;
}): EmailTicket[] {
  return input.tickets.map((ticket) => ({
    name: ticket.name,
    email: ticket.email,
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.ticketId,
    date: ticket.date,
    pickupTime: ticket.pickupTime,
    orgName: input.orgName,
    pickupLocation: input.pickupLocation,
    emailFromAddress: input.emailFromAddress,
    emailFromName: input.emailFromName,
  }));
}

export async function drawTodayLottery(
  winnerCount: number
): Promise<DrawLotteryResult> {
  try {
    const { orgId } = await requireRole("org:admin");

    if (!Number.isInteger(winnerCount) || winnerCount <= 0) {
      return { success: false, error: "Winner count must be a positive integer." };
    }

    // Fetch org for timezone and email branding
    const org = await getOrganization(orgId);
    if (!org) {
      return { success: false, error: "Organization not found." };
    }

    // Block draw when subscription is degraded
    try {
      requireActiveSub(org);
    } catch (subErr) {
      return { success: false, error: (subErr as Error).message };
    }

    const date = getTodayDateString(org.timezone);
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();
    const ticketsCollection = await getTicketsCollection();
    const participantSummariesCollection = await getParticipantSummariesCollection();
    const dispatchesCollection = await getEmailDispatchesCollection();
    const recipientsCollection = await getResultEmailRecipientsCollection();
    const client = await getClient();
    const drawnAt = new Date();

    let selectedWinners: Registrant[] = [];
    let ticketDocuments: Omit<Ticket, "_id">[] = [];
    const drawDispatchId = new ObjectId();

    try {
      await client.withSession(async (session) => {
        await session.withTransaction(async () => {
          const lockResult = await lotteriesCollection.updateOne(
            { orgId, date, status: { $ne: "LOTTERY_DRAWN" } },
            { $set: { status: "LOTTERY_DRAWN", drawnAt } },
            { session }
          );

          if (lockResult.matchedCount === 0) {
            throw new DrawUserError("Lottery already drawn for today.");
          }

          const registrants = await registrantsCollection.find({ orgId, date }, { session }).toArray();

          if (registrants.length === 0) {
            throw new DrawUserError("No registrants for today. Cannot draw lottery.");
          }

          if (winnerCount > registrants.length) {
            throw new DrawUserError(
              `Requested ${winnerCount} winners, but only ${registrants.length} registrants available.`
            );
          }

          selectedWinners = shuffleArray(registrants).slice(0, winnerCount);
          const winnerIds = selectedWinners.map((r) => r._id as ObjectId);
          const winnerIdSet = new Set(winnerIds.map((id) => id.toString()));
          // Persist the exact draw snapshot in the same transaction as tickets.
          // Retries must never infer participation from a later registration query.
          const nonWinners = registrants
            .filter((r) => !winnerIdSet.has(r._id!.toString()))
            .map((r) => ({
              registrantId: r._id!.toString(),
              email: r.email,
              date,
              orgName: org.name,
              emailFromAddress: org.emailFromAddress,
              emailFromName: org.emailFromName,
            }));
          ticketDocuments = buildTicketDocuments({
            orgId,
            selectedWinners,
            date,
            drawnAt,
            pickupTime: org.pickupTime ?? DEFAULT_PICKUP_TIME,
          });

          try {
            await ticketsCollection.insertMany(ticketDocuments, { session });
          } catch (err) {
            if (isTicketIdDuplicateKeyError(err)) {
              throw new DrawUserError("Could not generate unique ticket IDs. Please try again.");
            }
            throw err;
          }
          await recordWinnerTickets(participantSummariesCollection, ticketDocuments, session);

          const emailTickets = buildEmailTickets({
            tickets: ticketDocuments,
            orgName: org.name,
            pickupLocation: org.pickupLocation,
            emailFromAddress: org.emailFromAddress,
            emailFromName: org.emailFromName,
          });

          const now = new Date();
          await recipientsCollection.insertMany(
            [
              ...emailTickets.map((ticket) => {
                const _id = new ObjectId();
                return {
                  _id,
                  drawDispatchId,
                  orgId,
                  date,
                  kind: "winner" as const,
                  recipientId: ticket.ticketId,
                  ticket: { ...ticket, recipientRecordId: _id.toString() },
                  status: "pending" as const,
                  attempts: 0,
                  createdAt: now,
                  updatedAt: now,
                };
              }),
              ...nonWinners.map((nonWinner) => {
                const _id = new ObjectId();
                return {
                  _id,
                  drawDispatchId,
                  orgId,
                  date,
                  kind: "non_winner" as const,
                  recipientId: nonWinner.registrantId,
                  nonWinner: { ...nonWinner, recipientRecordId: _id.toString() },
                  status: "pending" as const,
                  attempts: 0,
                  createdAt: now,
                  updatedAt: now,
                };
              }),
            ],
            { session }
          );
          await lotteriesCollection.updateOne(
            { orgId, date },
            {
              $set: {
                winnerRegistrantIds: winnerIds,
                maxTicketsAvailable: winnerCount,
              },
            },
            { session }
          );

          await dispatchesCollection.insertOne(
            {
              _id: drawDispatchId,
              orgId,
              date,
              eventName: "lottery/draw.completed",
              dispatchKind: "draw",
              payload: { orgId, date, dispatchId: drawDispatchId.toString() },
              status: "pending",
              attempts: 0,
              createdAt: now,
              updatedAt: now,
            },
            { session }
          );
        });
      });
    } catch (err) {
      if (err instanceof DrawUserError) {
        return { success: false, error: err.message };
      }
      if (isDuplicateKeyError(err)) {
        return { success: false, error: "Lottery already drawn for today." };
      }
      throw err;
    }

    let emailDispatchError: string | undefined;

    // Dispatch only after the transaction commits. If dispatch fails, the
    // email_dispatches row stays in `failed` and recoverWinnerEmailDispatchesFunction
    // (cron, every 15 min) will retry it without re-drawing or re-inserting tickets.
    try {
      await dispatchWinnerEmailEvent({ orgId, date });
    } catch (err) {
      console.error("[drawTodayLottery] Email dispatch failed:", err);
      emailDispatchError =
        err instanceof Error ? err.message : "Winner email dispatch failed.";
    }

    const winners: WinnerInfo[] = selectedWinners.map((r, index) => ({
      _id: (r._id as ObjectId).toString(),
      name: r.name,
      email: r.email,
      enteredAt: r.enteredAt.toISOString(),
      ticketNumber: ticketDocuments[index].ticketNumber,
      ticketId: ticketDocuments[index].ticketId,
    }));

    return {
      success: true,
      winners,
      winnerCount,
      drawnAt: drawnAt.toISOString(),
      ...(emailDispatchError ? { emailDispatchError } : {}),
    };
  } catch (err) {
    console.error("drawTodayLottery error:", err);
    return { success: false, error: "Something went wrong while drawing the lottery. Please try again." };
  }
}

export async function retryTodayWinnerEmails(requestedDate?: string): Promise<RetryWinnerEmailsResult> {
  try {
    const { orgId } = await requireRole("org:admin");

    const org = await getOrganization(orgId);
    if (!org) {
      return { success: false, error: "Organization not found." };
    }

    const today = getTodayDateString(org.timezone);
    const date = requestedDate ?? today;
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ||
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date ||
      date > today
    ) {
      return { success: false, error: "Choose a valid draw date that is not in the future." };
    }
    const ticketsCollection = await getTicketsCollection();
    const dispatchesCollection = await getEmailDispatchesCollection();

    const originalDraw = await dispatchesCollection.findOne({
      orgId, date, eventName: "lottery/draw.completed", dispatchKind: "draw",
    });
    if (!originalDraw) {
      return { success: false, error: "No completed draw exists for that date." };
    }
    if (originalDraw.payload.dispatchId) {
      const recipientsCollection = await getResultEmailRecipientsCollection();
      const queued = await recipientsCollection.countDocuments({
        drawDispatchId: new ObjectId(originalDraw.payload.dispatchId),
        status: { $in: ["pending", "failed"] },
        attempts: { $lt: 10 },
      });
      if (queued === 0) {
        const needsReview = await recipientsCollection.countDocuments({
          drawDispatchId: new ObjectId(originalDraw.payload.dispatchId),
          $or: [
            { status: "uncertain" },
            { status: "failed", attempts: { $gte: 10 } },
          ],
        });
        if (needsReview) {
          return { success: false, error: `${needsReview} result email${needsReview === 1 ? "" : "s"} ${needsReview === 1 ? "needs" : "need"} provider reconciliation before retrying.` };
        }
        return { success: true, queued: 0 };
      }
      const now = new Date();
      let dispatchId: ObjectId;
      try {
        const inserted = await dispatchesCollection.insertOne({
          orgId, date, eventName: "lottery/draw.completed", dispatchKind: "manual_retry",
          payload: { orgId, date, dispatchId: originalDraw.payload.dispatchId },
          status: "pending", attempts: 0, createdAt: now, updatedAt: now,
        });
        dispatchId = inserted.insertedId;
      } catch (err) {
        if (isDuplicateKeyError(err)) {
          return { success: false, error: "A result email retry is already queued or dispatching." };
        }
        throw err;
      }
      let emailDispatchError: string | undefined;
      try {
        await dispatchWinnerEmailEvent({ dispatchId });
      } catch (err) {
        console.error("[retryTodayWinnerEmails] Email dispatch failed:", err);
        emailDispatchError = err instanceof Error ? err.message : "Result email retry dispatch failed.";
      }
      revalidatePath("/dashboard/lottery");
      return { success: true, queued, ...(emailDispatchError ? { emailDispatchError } : {}) };
    }
    const nonWinnerSnapshot = originalDraw.payload.nonWinners ?? [];
    const registrantsCollection = await getRegistrantsCollection();
    const unsentNonWinners = nonWinnerSnapshot.length
      ? await registrantsCollection.find({
          orgId, date,
          _id: { $in: nonWinnerSnapshot.map((r) => new ObjectId(r.registrantId)) },
          nonWinnerEmailSent: { $ne: true },
        }).toArray()
      : [];
    const unsentIds = new Set(unsentNonWinners.map((r) => r._id!.toString()));
    const nonWinners = nonWinnerSnapshot.filter((r) => unsentIds.has(r.registrantId));

    const unsentTickets = await ticketsCollection
      .find({ orgId, date, status: "ACTIVE", emailSent: { $ne: true } })
      .sort({ ticketNumber: 1 })
      .toArray();

    const unsentTicketIds = new Set(unsentTickets.map((ticket) => ticket.ticketId));
    const emailTickets = (originalDraw.payload.tickets ?? [])
      .filter((ticket) => unsentTicketIds.has(ticket.ticketId));
    if (emailTickets.length === 0 && nonWinners.length === 0) {
      return { success: true, queued: 0 };
    }
    const now = new Date();

    let dispatchId: ObjectId;
    try {
      const insertResult = await dispatchesCollection.insertOne({
        orgId,
        date,
        eventName: "lottery/draw.completed",
        dispatchKind: "manual_retry",
        payload: { orgId, date, tickets: emailTickets, ...(nonWinners.length ? { nonWinners } : {}) },
        status: "pending",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
      dispatchId = insertResult.insertedId;
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        const message = duplicateErrorIncludesField(err, "dispatchKind")
          ? "A winner email retry is already queued or dispatching."
          : "Email retry requires the email dispatch index migration. Run the database setup before retrying.";
        return { success: false, error: message };
      }
      throw err;
    }

    let emailDispatchError: string | undefined;
    try {
      await dispatchWinnerEmailEvent({ dispatchId });
    } catch (err) {
      console.error("[retryTodayWinnerEmails] Email dispatch failed:", err);
      emailDispatchError =
        err instanceof Error ? err.message : "Winner email retry dispatch failed.";
    }

    revalidatePath("/dashboard/lottery");

    return {
      success: true,
      queued: emailTickets.length + nonWinners.length,
      ...(emailDispatchError ? { emailDispatchError } : {}),
    };
  } catch (err) {
    console.error("retryTodayWinnerEmails error:", err);
    return { success: false, error: "Something went wrong while retrying winner emails." };
  }
}
