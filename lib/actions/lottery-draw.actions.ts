"use server";

import { randomInt } from "crypto";
import { ObjectId } from "mongodb";
import { revalidatePath } from "next/cache";
import {
  getClient,
  getEmailDispatchesCollection,
  getRegistrantsCollection,
  getLotteriesCollection,
  getTicketsCollection,
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
    const dispatchesCollection = await getEmailDispatchesCollection();
    const client = await getClient();
    const drawnAt = new Date();

    let selectedWinners: Registrant[] = [];
    let ticketDocuments: Omit<Ticket, "_id">[] = [];

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

          const emailTickets = buildEmailTickets({
            tickets: ticketDocuments,
            orgName: org.name,
            pickupLocation: org.pickupLocation,
            emailFromAddress: org.emailFromAddress,
            emailFromName: org.emailFromName,
          });

          const now = new Date();
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
              orgId,
              date,
              eventName: "lottery/draw.completed",
              dispatchKind: "draw",
              payload: { orgId, date, tickets: emailTickets },
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

export async function retryTodayWinnerEmails(): Promise<RetryWinnerEmailsResult> {
  try {
    const { orgId } = await requireRole("org:admin");

    const org = await getOrganization(orgId);
    if (!org) {
      return { success: false, error: "Organization not found." };
    }

    const date = getTodayDateString(org.timezone);
    const ticketsCollection = await getTicketsCollection();
    const dispatchesCollection = await getEmailDispatchesCollection();

    const unsentTickets = await ticketsCollection
      .find({ orgId, date, status: "ACTIVE", emailSent: { $ne: true } })
      .sort({ ticketNumber: 1 })
      .toArray();

    if (unsentTickets.length === 0) {
      return { success: true, queued: 0 };
    }

    const emailTickets = buildEmailTickets({
      tickets: unsentTickets,
      orgName: org.name,
      pickupLocation: org.pickupLocation,
      emailFromAddress: org.emailFromAddress,
      emailFromName: org.emailFromName,
    });
    const now = new Date();

    let dispatchId: ObjectId;
    try {
      const insertResult = await dispatchesCollection.insertOne({
        orgId,
        date,
        eventName: "lottery/draw.completed",
        dispatchKind: "manual_retry",
        payload: { orgId, date, tickets: emailTickets },
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
      queued: unsentTickets.length,
      ...(emailDispatchError ? { emailDispatchError } : {}),
    };
  } catch (err) {
    console.error("retryTodayWinnerEmails error:", err);
    return { success: false, error: "Something went wrong while retrying winner emails." };
  }
}
