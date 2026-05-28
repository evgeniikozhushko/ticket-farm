"use server";

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
import { inngest } from "@/inngest/client";
import type { EmailTicket } from "@/lib/email";

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function generateTicketId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

class DrawUserError extends Error {}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: number }).code === 11000;
}

async function dispatchWinnerEmailEvent(orgId: string, date: string): Promise<void> {
  const dispatchesCollection = await getEmailDispatchesCollection();
  const dispatch = await dispatchesCollection.findOne({
    orgId,
    date,
    eventName: "lottery/draw.completed",
    status: { $in: ["pending", "failed"] },
  });

  if (!dispatch) return;

  const now = new Date();
  try {
    await inngest.send({
      name: dispatch.eventName,
      data: dispatch.payload,
    });

    await dispatchesCollection.updateOne(
      { _id: dispatch._id },
      {
        $set: {
          status: "dispatched",
          dispatchedAt: now,
          updatedAt: now,
        },
        $unset: { lastError: "" },
      }
    );
  } catch (err) {
    await dispatchesCollection.updateOne(
      { _id: dispatch._id },
      {
        $set: {
          status: "failed",
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: now,
        },
        $inc: { attempts: 1 },
      }
    );
    throw err;
  }
}

export async function retryWinnerEmailDispatch(
  orgId: string,
  date: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await dispatchWinnerEmailEvent(orgId, date);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to dispatch winner email event.",
    };
  }
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

          ticketDocuments = selectedWinners.map((winner, index) => ({
            orgId,
            ticketNumber: index + 1,
            ticketId: generateTicketId(),
            name: winner.name,
            email: winner.email,
            date,
            pickupTime: "5:30 PM",
            status: "ACTIVE",
            generatedAt: drawnAt,
          }));

          await ticketsCollection.insertMany(ticketDocuments, { session });

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

    // Dispatch only after the transaction commits. If dispatch fails, the
    // email_dispatches record remains failed and retryWinnerEmailDispatch can
    // safely retry without re-drawing or re-inserting tickets.
    try {
      await dispatchWinnerEmailEvent(orgId, date);
    } catch (err) {
      console.error("[drawTodayLottery] Email dispatch failed:", err);
    }

    const winners: WinnerInfo[] = selectedWinners.map((r, index) => ({
      _id: (r._id as ObjectId).toString(),
      name: r.name,
      email: r.email,
      enteredAt: r.enteredAt.toISOString(),
      ticketNumber: ticketDocuments[index].ticketNumber,
      ticketId: ticketDocuments[index].ticketId,
    }));

    return { success: true, winners, winnerCount, drawnAt: drawnAt.toISOString() };
  } catch (err) {
    console.error("drawTodayLottery error:", err);
    return { success: false, error: "Something went wrong while drawing the lottery. Please try again." };
  }
}
