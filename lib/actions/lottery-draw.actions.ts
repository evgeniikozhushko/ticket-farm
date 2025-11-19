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

    // Check if lottery already drawn
    const existingLottery = await lotteriesCollection.findOne({ date });

    if (existingLottery && existingLottery.status === "LOTTERY_DRAWN") {
      return {
        success: false,
        error:
          "Lottery already drawn for today. You must reset or override to re-draw.",
      };
    }

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

    // Extract winner IDs
    const winnerIds = selectedWinners.map((r) => r._id as ObjectId);
    const drawnAt = new Date();

    // Generate tickets for all winners
    const ticketsCollection = await getTicketsCollection();
    const ticketDocuments: Omit<Ticket, "_id">[] = selectedWinners.map((winner, index) => ({
      ticketNumber: index + 1, // Sequential: 1, 2, 3...
      ticketId: generateTicketId(), // Random 6-digit code
      name: winner.name,
      email: winner.email,
      date: date,
      pickupTime: "5:30 PM", // Default pickup time
      status: "ACTIVE",
      generatedAt: drawnAt,
    }));

    // Insert all tickets at once
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

    // Send emails in parallel (don't block lottery draw on email failures)
    const emailResults = await sendBulkWinnerEmails(emailTickets);

    // Update tickets with email status
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

    // Prepare winner info with ticket data and email status (serialized for Client Components)
    const winners: WinnerInfo[] = selectedWinners.map((r, index) => {
      const emailResult = emailResults.find((result) => result.email === r.email);
      return {
        _id: (r._id as ObjectId).toString(), // Serialize ObjectId to string
        name: r.name,
        email: r.email,
        enteredAt: r.enteredAt.toISOString(), // Serialize Date to ISO string
        ticketNumber: ticketDocuments[index].ticketNumber,
        ticketId: ticketDocuments[index].ticketId,
        emailSent: emailResult?.success,
        emailError: emailResult?.error,
      };
    });

    // Upsert lottery document
    await lotteriesCollection.updateOne(
      { date },
      {
        $set: {
          status: "LOTTERY_DRAWN",
          winnerRegistrantIds: winnerIds,
          drawnAt: drawnAt,
        },
        $setOnInsert: {
          date,
          dailyTheme: "", // Can be set separately by admin
          maxTicketsAvailable: winnerCount,
        },
      },
      { upsert: true }
    );

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
