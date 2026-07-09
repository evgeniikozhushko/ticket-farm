"use server";

import { randomInt } from "crypto";
import { ObjectId } from "mongodb";
import {
  getClient,
  getEmailDispatchesCollection,
  getRegistrantsCollection,
  getLotteriesCollection,
  getTicketsCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { DrawLotteryResult, WinnerInfo, Registrant, Ticket } from "@/lib/types";
import { requireRole, requireActiveSub } from "@/lib/authz";
import { getOrganization } from "@/lib/actions/org.actions";
import { dispatchWinnerEmailEvent } from "@/lib/email-dispatch-outbox";
import type { EmailTicket } from "@/lib/email";

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

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000;
}

function duplicateErrorIncludesField(err: unknown, field: string): boolean {
  if (!err || typeof err !== "object") return false;

  const error = err as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    index?: string;
    message?: string;
    writeErrors?: Array<{
      err?: {
        keyPattern?: Record<string, unknown>;
        keyValue?: Record<string, unknown>;
        index?: string;
        errmsg?: string;
      };
      keyPattern?: Record<string, unknown>;
      keyValue?: Record<string, unknown>;
      index?: string;
      errmsg?: string;
    }>;
  };

  if (error.keyPattern && field in error.keyPattern) return true;
  if (error.keyValue && field in error.keyValue) return true;
  if (error.index?.includes(field)) return true;
  if (error.message?.includes(field)) return true;

  return Boolean(
    error.writeErrors?.some((writeError) => {
      const nested = writeError.err ?? writeError;
      return (
        Boolean(nested.keyPattern && field in nested.keyPattern) ||
        Boolean(nested.keyValue && field in nested.keyValue) ||
        Boolean(nested.index?.includes(field)) ||
        Boolean(nested.errmsg?.includes(field))
      );
    })
  );
}

function isTicketIdDuplicateKeyError(err: unknown): boolean {
  return isDuplicateKeyError(err) && duplicateErrorIncludesField(err, "ticketId");
}

function buildTicketDocuments(input: {
  orgId: string;
  selectedWinners: Registrant[];
  date: string;
  drawnAt: Date;
}): Omit<Ticket, "_id">[] {
  return input.selectedWinners.map((winner, index) => ({
    orgId: input.orgId,
    ticketNumber: index + 1,
    ticketId: generateTicketId(),
    name: winner.name,
    email: winner.email,
    date: input.date,
    pickupTime: "5:30 PM",
    status: "ACTIVE",
    generatedAt: input.drawnAt,
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
          ticketDocuments = buildTicketDocuments({ orgId, selectedWinners, date, drawnAt });

          try {
            await ticketsCollection.insertMany(ticketDocuments, { session });
          } catch (err) {
            if (isTicketIdDuplicateKeyError(err)) {
              throw new DrawUserError("Could not generate unique ticket IDs. Please try again.");
            }
            throw err;
          }

          const emailTickets: EmailTicket[] = ticketDocuments.map((ticket) => ({
            name: ticket.name,
            email: ticket.email,
            ticketNumber: ticket.ticketNumber,
            ticketId: ticket.ticketId,
            date: ticket.date,
            pickupTime: ticket.pickupTime,
            orgName: org.name,
            pickupLocation: undefined,
            emailFromAddress: org.emailFromAddress,
            emailFromName: org.emailFromName,
          }));

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
