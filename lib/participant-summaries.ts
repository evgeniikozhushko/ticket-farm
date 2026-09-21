import type { ClientSession, Collection } from "mongodb";
import type { ParticipantSummaryDocument, Registrant, Ticket } from "@/lib/types";

export function normalizeParticipantName(name: string): string {
  return name.trim().toLowerCase();
}

export async function recordParticipantRegistration(
  collection: Collection<ParticipantSummaryDocument>,
  registrant: Registrant,
  session: ClientSession,
) {
  const normalizedName = normalizeParticipantName(registrant.name);
  await collection.updateOne(
    { orgId: registrant.orgId, email: registrant.email },
    [
      {
        $set: {
          orgId: registrant.orgId,
          email: registrant.email,
          entryCount: { $add: [{ $ifNull: ["$entryCount", 0] }, 1] },
          firstEnteredAt: { $min: [{ $ifNull: ["$firstEnteredAt", registrant.enteredAt] }, registrant.enteredAt] },
          lastEnteredAt: { $max: [{ $ifNull: ["$lastEnteredAt", registrant.enteredAt] }, registrant.enteredAt] },
          latestName: {
            $cond: [
              { $gte: [registrant.enteredAt, { $ifNull: ["$lastEnteredAt", registrant.enteredAt] }] },
              registrant.name,
              "$latestName",
            ],
          },
          normalizedName: {
            $cond: [
              { $gte: [registrant.enteredAt, { $ifNull: ["$lastEnteredAt", registrant.enteredAt] }] },
              normalizedName,
              "$normalizedName",
            ],
          },
          winCount: { $ifNull: ["$winCount", 0] },
          activeTicketCount: { $ifNull: ["$activeTicketCount", 0] },
          checkedInTicketCount: { $ifNull: ["$checkedInTicketCount", 0] },
        },
      },
    ],
    { session, upsert: true },
  );
}

export async function recordWinnerTickets(
  collection: Collection<ParticipantSummaryDocument>,
  tickets: Omit<Ticket, "_id">[],
  session: ClientSession,
) {
  if (tickets.length === 0) return;
  await collection.bulkWrite(
    tickets.map((ticket) => ({
      updateOne: {
        filter: { orgId: ticket.orgId, email: ticket.email },
        update: { $inc: { winCount: 1, activeTicketCount: 1 } },
      },
    })),
    { session },
  );
}
