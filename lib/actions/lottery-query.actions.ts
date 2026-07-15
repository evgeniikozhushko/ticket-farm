"use server";

import { ObjectId } from "mongodb";
import { getRegistrantsCollection, getLotteriesCollection, getTicketsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import type { Registrant, Lottery, LotteryStats, WinnerInfo, Ticket } from "@/lib/types";
import { requireRole } from "@/lib/authz";
import { getOrganization } from "@/lib/orgs";

export async function getTodayLotteryStats(): Promise<LotteryStats> {
  try {
    const { orgId } = await requireRole("org:member");
    const org = await getOrganization(orgId);
    const date = getTodayDateString(org?.timezone);
    const registrantsCollection = await getRegistrantsCollection();
    const lotteriesCollection = await getLotteriesCollection();

    const [totalRegistrants, lottery] = await Promise.all([
      registrantsCollection.countDocuments({ orgId, date }),
      lotteriesCollection.findOne({ orgId, date }),
    ]);

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
    return {
      totalRegistrants: 0,
      status: "OPEN",
      winnersDrawn: 0,
      lotteryDate: getTodayDateString(),
      maxTicketsAvailable: 0,
    };
  }
}

export async function getTodayRegistrants(): Promise<Registrant[]> {
  try {
    const { orgId } = await requireRole("org:member");
    const org = await getOrganization(orgId);
    const date = getTodayDateString(org?.timezone);
    const collection = await getRegistrantsCollection();

    return collection.find({ orgId, date }).sort({ enteredAt: 1 }).toArray();
  } catch (err) {
    console.error("getTodayRegistrants error:", err);
    return [];
  }
}

export async function getTodayLottery(): Promise<Lottery | null> {
  try {
    const { orgId } = await requireRole("org:member");
    const org = await getOrganization(orgId);
    const date = getTodayDateString(org?.timezone);
    const collection = await getLotteriesCollection();

    return collection.findOne({ orgId, date });
  } catch (err) {
    console.error("getTodayLottery error:", err);
    return null;
  }
}

export async function getTodayWinners(): Promise<WinnerInfo[]> {
  try {
    const { orgId } = await requireRole("org:member");
    const org = await getOrganization(orgId);
    const date = getTodayDateString(org?.timezone);
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();
    const ticketsCollection = await getTicketsCollection();

    const lottery = await lotteriesCollection.findOne({ orgId, date });
    if (!lottery || lottery.status !== "LOTTERY_DRAWN" || !lottery.winnerRegistrantIds) {
      return [];
    }

    const [winners, tickets] = await Promise.all([
      registrantsCollection.find({ _id: { $in: lottery.winnerRegistrantIds } }).toArray(),
      ticketsCollection.find({ orgId, date }).sort({ ticketNumber: 1 }).toArray(),
    ]);

    const ticketMap = new Map<string, Ticket>(tickets.map((t) => [t.email, t]));

    return winners
      .map((w) => {
        const ticket = ticketMap.get(w.email);
        return {
          _id: (w._id as ObjectId).toString(),
          name: w.name,
          email: w.email,
          enteredAt: w.enteredAt.toISOString(),
          ticketNumber: ticket?.ticketNumber,
          ticketId: ticket?.ticketId,
          emailSent: ticket?.emailSent,
          emailError: ticket?.emailError,
        };
      })
      .sort((a, b) => (a.ticketNumber || 0) - (b.ticketNumber || 0));
  } catch (err) {
    console.error("getTodayWinners error:", err);
    return [];
  }
}
