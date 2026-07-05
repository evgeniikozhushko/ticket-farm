"use server";

import { getRegistrantsCollection, getTicketsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
import type { Document } from "mongodb";
import type {
  ParticipantHistoryEntry,
  ParticipantSummary,
  Registrant,
  Ticket,
} from "@/lib/types";

type ListOrgParticipantsOptions = {
  search?: string;
  limit: number;
  cursor?: string;
};

export type ListOrgParticipantsResult = {
  participants: ParticipantSummary[];
  nextCursor?: string;
};

function normalizeParticipantEmail(email: string): string {
  return email.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => (word ? `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}` : word))
    .join(" ");
}

export async function listOrgParticipants(
  opts: ListOrgParticipantsOptions
): Promise<ListOrgParticipantsResult> {
  const { orgId } = await requireRole("org:member");
  const registrantsCollection = await getRegistrantsCollection();

  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const rawSearch = opts.search?.trim() ?? "";
  const search = rawSearch.toLowerCase();
  const cursor = opts.cursor?.trim().toLowerCase();

  const match: Document = { orgId };
  const participantMatch: Document = {};
  const searchClauses: Document[] = [];
  if (search) {
    searchClauses.push({ email: { $regex: `^${escapeRegExp(search)}` } });

    const namePrefixes = new Set([
      rawSearch,
      search,
      titleCaseWords(rawSearch),
    ]);
    for (const prefix of namePrefixes) {
      if (prefix) {
        searchClauses.push({ latestName: { $regex: `^${escapeRegExp(prefix)}` } });
      }
    }
  }

  if (cursor) {
    participantMatch.email = { $gt: cursor };
  }
  if (searchClauses.length > 0) {
    participantMatch.$or = searchClauses;
  }

  const rows = await registrantsCollection
    .aggregate<ParticipantSummary>([
      { $match: match },
      {
        $set: {
          participantEmail: { $toLower: { $trim: { input: "$email" } } },
        },
      },
      { $sort: { participantEmail: 1, enteredAt: 1 } },
      {
        $group: {
          _id: "$participantEmail",
          orgId: { $first: "$orgId" },
          email: { $first: "$participantEmail" },
          latestName: { $last: "$name" },
          firstEnteredAt: { $first: "$enteredAt" },
          lastEnteredAt: { $last: "$enteredAt" },
          entryCount: { $sum: 1 },
        },
      },
      { $sort: { email: 1 } },
      ...(Object.keys(participantMatch).length > 0
        ? [{ $match: participantMatch }]
        : []),
      { $limit: limit + 1 },
      {
        $lookup: {
          from: "tickets",
          let: { orgId: "$orgId", email: "$email" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$orgId", "$$orgId"] },
                    { $eq: ["$email", "$$email"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                winCount: { $sum: 1 },
                activeTicketCount: {
                  $sum: { $cond: [{ $eq: ["$status", "ACTIVE"] }, 1, 0] },
                },
                checkedInTicketCount: {
                  $sum: { $cond: [{ $eq: ["$status", "CHECKED_IN"] }, 1, 0] },
                },
              },
            },
          ],
          as: "ticketCounts",
        },
      },
      {
        $set: {
          ticketCounts: { $first: "$ticketCounts" },
        },
      },
      {
        $project: {
          _id: 0,
          orgId: 1,
          email: 1,
          latestName: 1,
          firstEnteredAt: 1,
          lastEnteredAt: 1,
          entryCount: 1,
          winCount: { $ifNull: ["$ticketCounts.winCount", 0] },
          activeTicketCount: { $ifNull: ["$ticketCounts.activeTicketCount", 0] },
          checkedInTicketCount: { $ifNull: ["$ticketCounts.checkedInTicketCount", 0] },
        },
      },
    ])
    .toArray();

  const participants = rows.slice(0, limit);
  const nextCursor = rows.length > limit ? participants.at(-1)?.email : undefined;

  return { participants, nextCursor };
}

export async function getParticipantHistory(
  email: string
): Promise<ParticipantHistoryEntry[]> {
  const { orgId } = await requireRole("org:member");
  const normalizedEmail = normalizeParticipantEmail(email);

  if (!normalizedEmail) return [];

  const registrantsCollection = await getRegistrantsCollection();
  const ticketsCollection = await getTicketsCollection();

  const [registrants, tickets] = await Promise.all([
    registrantsCollection
      .find({ orgId, email: normalizedEmail })
      .sort({ date: -1, enteredAt: -1 })
      .toArray(),
    ticketsCollection.find({ orgId, email: normalizedEmail }).toArray(),
  ]);

  const ticketsByDate = new Map<string, Ticket>();
  for (const ticket of tickets as Ticket[]) {
    ticketsByDate.set(ticket.date, ticket);
  }

  return (registrants as Registrant[]).map((registrant) => {
    const ticket = ticketsByDate.get(registrant.date);

    return {
      date: registrant.date,
      enteredAt: registrant.enteredAt,
      won: Boolean(ticket),
      ticketNumber: ticket?.ticketNumber,
      ticketId: ticket?.ticketId,
      ticketStatus: ticket?.status,
      emailSent: ticket?.emailSent,
      emailError: ticket?.emailError,
    };
  });
}
