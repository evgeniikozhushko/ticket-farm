"use server";

import { ObjectId } from "mongodb";
import { getRegistrantsCollection, getLotteriesCollection, getTicketsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { DrawLotteryResult, WinnerInfo, Ticket } from "@/lib/types";
import { sendBulkWinnerEmails, type EmailTicket } from "@/lib/email";

/**
 * Fisher-Yates shuffle algorithm for random array shuffling
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generates a random 6-digit ticket ID
 */
function generateTicketId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Runs the lottery draw for today.
 * Randomly selects N unique winners from today's registrants.
 * Updates the lottery document with winner IDs and status.
 *
 * @param winnerCount - Number of winners to select
 * @returns DrawLotteryResult with winners or error
 */
export async function drawTodayLottery(
  winnerCount: number
): Promise<DrawLotteryResult> {
  try {
    // Validation: Ensure winnerCount is a positive integer
    if (!Number.isInteger(winnerCount) || winnerCount <= 0) {
      return {
        success: false,
        error: "Winner count must be a positive integer.",
      };
    }

    const date = getTodayDateString();
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();

    // Fetch today's registrants
    const registrants = await registrantsCollection
      .find({ date })
      .toArray();

    // Validate: Check if there are enough registrants
    if (registrants.length === 0) {
      return {
        success: false,
        error: "No registrants for today. Cannot draw lottery.",
      };
    }

    if (winnerCount > registrants.length) {
      return {
        success: false,
        error: `Requested ${winnerCount} winners, but only ${registrants.length} registrants available. Please reduce the winner count.`,
      };
    }

    // Random selection: Shuffle and take first N
    const shuffled = shuffleArray(registrants);
    const selectedWinners = shuffled.slice(0, winnerCount);
    const winnerIds = selectedWinners.map((r) => r._id as ObjectId);
    const drawnAt = new Date();

    // Atomically acquire the draw lock by transitioning the lottery document
    // to LOTTERY_DRAWN status. The filter { status: { $ne: "LOTTERY_DRAWN" } }
    // ensures only one concurrent request can succeed. If the lottery is already
    // drawn, the filter will not match; with upsert:true MongoDB attempts to
    // insert a new document, which is blocked by the unique { date } index
    // (E11000). We catch that to detect the race condition.
    try {
      await lotteriesCollection.updateOne(
        { date, status: { $ne: "LOTTERY_DRAWN" } },
        {
          $set: {
            status: "LOTTERY_DRAWN",
            winnerRegistrantIds: winnerIds,
            drawnAt,
          },
          $setOnInsert: {
            date,
            dailyTheme: "",
            maxTicketsAvailable: winnerCount,
          },
        },
        { upsert: true }
      );
    } catch (lockErr) {
      if (
        typeof lockErr === "object" &&
        lockErr !== null &&
        "code" in lockErr &&
        (lockErr as { code: number }).code === 11000
      ) {
        return {
          success: false,
          error: "Lottery already drawn for today. You must reset or override to re-draw.",
        };
      }
      throw lockErr;
    }

    // Lock acquired — generate and insert tickets
    const ticketsCollection = await getTicketsCollection();
    const ticketDocuments: Omit<Ticket, "_id">[] = selectedWinners.map((winner, index) => ({
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

    // Send winner notification emails
    const emailTickets: EmailTicket[] = ticketDocuments.map((ticket) => ({
      name: ticket.name,
      email: ticket.email,
      ticketNumber: ticket.ticketNumber,
      ticketId: ticket.ticketId,
      date: ticket.date,
      pickupTime: ticket.pickupTime,
    }));

    const emailResults = await sendBulkWinnerEmails(emailTickets);

    // Update tickets with email delivery status
    const emailUpdates = emailResults.map((result) => ({
      updateOne: {
        filter: {
          date,
          email: result.email,
        },
        update: {
          $set: {
            emailSent: result.success,
            emailSentAt: result.success ? drawnAt : undefined,
            emailError: result.error,
          },
        },
      },
    }));

    if (emailUpdates.length > 0) {
      await ticketsCollection.bulkWrite(emailUpdates);
    }

    // Prepare winner info for client (serialize ObjectId and Date)
    const winners: WinnerInfo[] = selectedWinners.map((r, index) => {
      const emailResult = emailResults.find((result) => result.email === r.email);
      return {
        _id: (r._id as ObjectId).toString(),
        name: r.name,
        email: r.email,
        enteredAt: r.enteredAt.toISOString(),
        ticketNumber: ticketDocuments[index].ticketNumber,
        ticketId: ticketDocuments[index].ticketId,
        emailSent: emailResult?.success,
        emailError: emailResult?.error,
      };
    });

    return {
      success: true,
      winners,
      winnerCount,
      drawnAt: drawnAt.toISOString(), // Serialize Date to ISO string
    };
  } catch (err) {
    console.error("drawTodayLottery error:", err);
    return {
      success: false,
      error: "Something went wrong while drawing the lottery. Please try again.",
    };
  }
}
