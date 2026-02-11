"use server";

import { ObjectId } from "mongodb";
import { getRegistrantsCollection, getLotteriesCollection, getTicketsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { DrawLotteryResult, WinnerInfo, Ticket } from "@/lib/types";
import { requireRole } from "@/lib/authz";
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

    const date = getTodayDateString(org.timezone);
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();

    const registrants = await registrantsCollection.find({ orgId, date }).toArray();

    if (registrants.length === 0) {
      return { success: false, error: "No registrants for today. Cannot draw lottery." };
    }

    if (winnerCount > registrants.length) {
      return {
        success: false,
        error: `Requested ${winnerCount} winners, but only ${registrants.length} registrants available.`,
      };
    }

    const shuffled = shuffleArray(registrants);
    const selectedWinners = shuffled.slice(0, winnerCount);
    const winnerIds = selectedWinners.map((r) => r._id as ObjectId);
    const drawnAt = new Date();

    // Atomically acquire draw lock — prevents concurrent draws
    try {
      await lotteriesCollection.updateOne(
        { orgId, date, status: { $ne: "LOTTERY_DRAWN" } },
        {
          $set: { status: "LOTTERY_DRAWN", winnerRegistrantIds: winnerIds, drawnAt },
          $setOnInsert: { orgId, date, dailyTheme: "", maxTicketsAvailable: winnerCount, registrantCount: 0 },
        },
        { upsert: true }
      );
    } catch (lockErr) {
      if (
        typeof lockErr === "object" && lockErr !== null &&
        "code" in lockErr && (lockErr as { code: number }).code === 11000
      ) {
        return { success: false, error: "Lottery already drawn for today." };
      }
      throw lockErr;
    }

    // Generate and insert tickets
    const ticketsCollection = await getTicketsCollection();
    const ticketDocuments: Omit<Ticket, "_id">[] = selectedWinners.map((winner, index) => ({
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

    await ticketsCollection.insertMany(ticketDocuments);

    // Emit Inngest event — email sending happens in background, outside HTTP request
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

    await inngest.send({
      name: "lottery/draw.completed",
      data: { orgId, date, tickets: emailTickets },
    });

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
