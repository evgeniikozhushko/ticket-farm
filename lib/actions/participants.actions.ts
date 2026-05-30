"use server";

import { getRegistrantsCollection, getTicketsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
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

function normalizeParticipantEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function listOrgParticipants(
  opts: ListOrgParticipantsOptions
): Promise<ParticipantSummary[]> {
  const { orgId } = await requireRole("org:member");
  const registrantsCollection = await getRegistrantsCollection();
  const ticketsCollection = await getTicketsCollection();

  const limit = Math.min(Math.max(opts.limit, 1), 100);
  const search = opts.search?.trim().toLowerCase() ?? "";
  const cursor = opts.cursor?.trim().toLowerCase();

  const [registrants, tickets] = await Promise.all([
    registrantsCollection.find({ orgId }).sort({ enteredAt: 1 }).toArray(),
    ticketsCollection.find({ orgId }).toArray(),
  ]);

  const ticketsByEmail = new Map<string, Ticket[]>();
  for (const ticket of tickets) {
    const email = normalizeParticipantEmail(ticket.email);
    ticketsByEmail.set(email, [...(ticketsByEmail.get(email) ?? []), ticket]);
  }

  const summaries = new Map<string, ParticipantSummary>();
  for (const registrant of registrants as Registrant[]) {
    const email = normalizeParticipantEmail(registrant.email);
    const existing = summaries.get(email);

    if (!existing) {
      summaries.set(email, {
        orgId,
        email,
        latestName: registrant.name,
        firstEnteredAt: registrant.enteredAt,
        lastEnteredAt: registrant.enteredAt,
        entryCount: 1,
        winCount: 0,
        activeTicketCount: 0,
        checkedInTicketCount: 0,
      });
      continue;
    }

    existing.latestName = registrant.name;
    existing.lastEnteredAt = registrant.enteredAt;
    existing.entryCount += 1;
  }

  for (const summary of summaries.values()) {
    const participantTickets = ticketsByEmail.get(summary.email) ?? [];
    summary.winCount = participantTickets.length;
    summary.activeTicketCount = participantTickets.filter((ticket) => ticket.status === "ACTIVE").length;
    summary.checkedInTicketCount = participantTickets.filter((ticket) => ticket.status === "CHECKED_IN").length;
  }

  return [...summaries.values()]
    .filter((summary) => {
      if (!search) return true;
      return (
        summary.email.includes(search) ||
        summary.latestName.toLowerCase().includes(search)
      );
    })
    .filter((summary) => (cursor ? summary.email > cursor : true))
    .sort((a, b) => a.email.localeCompare(b.email))
    .slice(0, limit);
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
