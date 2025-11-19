"use server";

import { ObjectId } from "mongodb";
import { getRegistrantsCollection, getLotteriesCollection, getTicketsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { Registrant, Lottery, LotteryStats, WinnerInfo, Ticket } from "@/lib/types";

/**
 * Fetches today's lottery statistics for the dashboard cards
 */
export async function getTodayLotteryStats(): Promise<LotteryStats> {
  try {
    const date = getTodayDateString();
    const registrantsCollection = await getRegistrantsCollection();
    const lotteriesCollection = await getLotteriesCollection();

    // Count today's registrants
    const totalRegistrants = await registrantsCollection.countDocuments({ date });

    // Fetch today's lottery
    const lottery = await lotteriesCollection.findOne({ date });

    return {
      totalRegistrants,
      status: lottery?.status || "OPEN",
      winnersDrawn: lottery?.winnerRegistrantIds?.length || 0,
      lotteryDate: date,
      drawnAt: lottery?.drawnAt,
      maxTicketsAvailable: lottery?.maxTicketsAvailable || 0,
    };
  } catch (err) {
    console.error("getTodayLotteryStats error:", err);
    // Return default stats on error
    return {
      totalRegistrants: 0,
      status: "OPEN",
      winnersDrawn: 0,
      lotteryDate: getTodayDateString(),
      maxTicketsAvailable: 0,
    };
  }
}

/**
 * Fetches all registrants for today
 */
export async function getTodayRegistrants(): Promise<Registrant[]> {
  try {
    const date = getTodayDateString();
    const collection = await getRegistrantsCollection();

    const registrants = await collection
      .find({ date })
      .sort({ enteredAt: 1 }) // Earliest first
      .toArray();

    return registrants;
  } catch (err) {
    console.error("getTodayRegistrants error:", err);
    return [];
  }
}

/**
 * Fetches today's lottery document
 */
export async function getTodayLottery(): Promise<Lottery | null> {
  try {
    const date = getTodayDateString();
    const collection = await getLotteriesCollection();

    const lottery = await collection.findOne({ date });
    return lottery;
  } catch (err) {
    console.error("getTodayLottery error:", err);
    return null;
  }
}

/**
 * Fetches today's winners (registrants who were selected)
 * Only returns data if lottery has been drawn
 * Includes ticket information (ticketNumber, ticketId)
 */
export async function getTodayWinners(): Promise<WinnerInfo[]> {
  try {
    const date = getTodayDateString();
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();
    const ticketsCollection = await getTicketsCollection();

    // Get lottery to check if drawn
    const lottery = await lotteriesCollection.findOne({ date });

    if (!lottery || lottery.status !== "LOTTERY_DRAWN" || !lottery.winnerRegistrantIds) {
      return [];
    }

    // Fetch winner registrants
    const winners = await registrantsCollection
      .find({
        _id: { $in: lottery.winnerRegistrantIds },
      })
      .toArray();

    // Fetch tickets for today
    const tickets = await ticketsCollection
      .find({ date })
      .sort({ ticketNumber: 1 }) // Sort by ticket number ascending
      .toArray();

    // Create a map of email -> ticket for quick lookup
    const ticketMap = new Map<string, Ticket>(
      tickets.map((t) => [t.email, t])
    );

    // Map to WinnerInfo type with ticket data (serialized for Client Components)
    return winners.map((w) => {
      const ticket = ticketMap.get(w.email);
      return {
        _id: (w._id as ObjectId).toString(), // Serialize ObjectId to string
        name: w.name,
        email: w.email,
        enteredAt: w.enteredAt.toISOString(), // Serialize Date to ISO string
        ticketNumber: ticket?.ticketNumber,
        ticketId: ticket?.ticketId,
        emailSent: ticket?.emailSent,
        emailError: ticket?.emailError,
      };
    }).sort((a, b) => (a.ticketNumber || 0) - (b.ticketNumber || 0)); // Sort by ticket number
  } catch (err) {
    console.error("getTodayWinners error:", err);
    return [];
  }
}
