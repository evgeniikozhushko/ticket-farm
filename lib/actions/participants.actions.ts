"use server";

import { getParticipantSummariesCollection, getRegistrantsCollection, getTicketsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
import type { ParticipantHistoryEntry, ParticipantSummary, Registrant, Ticket } from "@/lib/types";

const HISTORY_PAGE_SIZE = 100;
type ListOrgParticipantsOptions = { search?: string; limit: number; cursor?: string };
export type ListOrgParticipantsResult = { participants: ParticipantSummary[]; nextCursor?: string };
export type ParticipantHistoryResult = { entries: ParticipantHistoryEntry[]; nextCursor?: string };

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function encodeNameCursor(normalizedName: string, email: string): string { return Buffer.from(JSON.stringify({ normalizedName, email })).toString("base64url"); }
function decodeNameCursor(cursor?: string): { normalizedName: string; email: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return typeof value.normalizedName === "string" && typeof value.email === "string" ? value : null;
  } catch { return null; }
}

export async function listOrgParticipants(opts: ListOrgParticipantsOptions): Promise<ListOrgParticipantsResult> {
  const { orgId } = await requireRole("org:member");
  const collection = await getParticipantSummariesCollection();
  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const search = opts.search?.trim().toLowerCase() ?? "";
  if (search && !search.includes("@")) {
    const cursor = decodeNameCursor(opts.cursor);
    const prefix = `^${escapeRegExp(search)}`;
    const rows = await collection.find({
      orgId,
      ...(cursor ? { $or: [
        { normalizedName: { $gt: cursor.normalizedName, $regex: prefix } },
        { normalizedName: cursor.normalizedName, email: { $gt: cursor.email } },
      ] } : { normalizedName: { $regex: prefix } }),
    }).sort({ normalizedName: 1, email: 1 }).limit(limit + 1).toArray();
    const participants = rows.slice(0, limit).map((row) => {
      const participant = { ...row };
      delete (participant as Partial<typeof row>).normalizedName;
      return participant as ParticipantSummary;
    });
    const last = rows[limit - 1];
    return { participants, ...(rows.length > limit && last ? { nextCursor: encodeNameCursor(last.normalizedName, last.email) } : {}) };
  }
  const cursor = opts.cursor?.trim().toLowerCase();
  const rows = await collection.find({ orgId, ...(search ? { email: { $regex: `^${escapeRegExp(search)}` } } : {}), ...(cursor ? { email: { $gt: cursor } } : {}) })
    .sort({ email: 1 }).limit(limit + 1).toArray();
  const participants = rows.slice(0, limit).map((row) => {
    const participant = { ...row };
    delete (participant as Partial<typeof row>).normalizedName;
    return participant as ParticipantSummary;
  });
  return { participants, ...(rows.length > limit && participants.at(-1) ? { nextCursor: participants.at(-1)!.email } : {}) };
}

export async function getParticipantHistory(email: string, cursor?: string): Promise<ParticipantHistoryResult> {
  const { orgId } = await requireRole("org:member");
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return { entries: [] };
  const registrantsCollection = await getRegistrantsCollection();
  const ticketsCollection = await getTicketsCollection();
  const rows = await registrantsCollection.find({ orgId, email: normalizedEmail, ...(cursor ? { date: { $lt: cursor } } : {}) }).sort({ date: -1, enteredAt: -1 }).limit(HISTORY_PAGE_SIZE + 1).toArray();
  const registrants = rows.slice(0, HISTORY_PAGE_SIZE) as Registrant[];
  const tickets = registrants.length === 0 ? [] : await ticketsCollection.find({ orgId, email: normalizedEmail, date: { $in: registrants.map((row) => row.date) } }).toArray() as Ticket[];
  const ticketsByDate = new Map(tickets.map((ticket) => [ticket.date, ticket]));
  const entries = registrants.map((registrant) => {
    const ticket = ticketsByDate.get(registrant.date);
    return { date: registrant.date, enteredAt: registrant.enteredAt, won: Boolean(ticket), ticketNumber: ticket?.ticketNumber, ticketId: ticket?.ticketId, ticketStatus: ticket?.status, checkedInAt: ticket?.checkedInAt?.toISOString(), emailSent: ticket ? ticket.emailSent : registrant.nonWinnerEmailSent, emailError: ticket ? ticket.emailError : registrant.nonWinnerEmailError, emailDelivery: ticket ? ticket.emailDelivery : registrant.nonWinnerEmailDelivery };
  });
  return { entries, ...(rows.length > HISTORY_PAGE_SIZE && entries.at(-1) ? { nextCursor: entries.at(-1)!.date } : {}) };
}
