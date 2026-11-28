"use server";

import { requireRole } from "@/lib/authz";
import { getClient, getParticipantSummariesCollection, getTicketsCollection } from "@/lib/mongodb";
import type { Ticket } from "@/lib/types";
import { revalidatePath } from "next/cache";

export type RedemptionResult =
  | { outcome: "invalid" | "error"; message: string }
  | {
      outcome: "active" | "redeemed" | "already_redeemed" | "canceled" | "already_canceled";
      ticket: { ticketId: string; ticketNumber: number; name: string; date: string; pickupTime: string; checkedInAt?: string; canceledAt?: string };
    };

function normalizeReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reference = value.trim().toUpperCase();
  return /^[0-9A-Z]{12}$/.test(reference) ? reference : null;
}

function ticketResult(ticket: Ticket, completed?: "redeemed" | "canceled"): RedemptionResult {
  let outcome: "active" | "already_redeemed" | "already_canceled" = "active";
  if (ticket.status === "CANCELED") outcome = "already_canceled";
  else if (ticket.status === "CHECKED_IN" || ticket.checkedInAt) outcome = "already_redeemed";
  return {
    outcome: completed ?? outcome,
    ticket: {
      ticketId: ticket.ticketId, ticketNumber: ticket.ticketNumber,
      name: ticket.name, date: ticket.date, pickupTime: ticket.pickupTime,
      checkedInAt: ticket.checkedInAt?.toISOString(),
      canceledAt: ticket.canceledAt?.toISOString(),
    },
  };
}

const invalid: RedemptionResult = { outcome: "invalid", message: "No ticket found for this Reference in your organization." };

export async function lookupTicketReference(reference: string): Promise<RedemptionResult> {
  const { orgId } = await requireRole("org:member");
  const ticketId = normalizeReference(reference);
  if (!ticketId) return invalid;
  try {
    const collection = await getTicketsCollection();
    const ticket = await collection.findOne({ orgId, ticketId });
    return ticket ? ticketResult(ticket) : invalid;
  } catch {
    return { outcome: "error", message: "Ticket lookup is unavailable. Please try again." };
  }
}

export async function redeemTicketReference(reference: string): Promise<RedemptionResult> {
  const { orgId } = await requireRole("org:member");
  const ticketId = normalizeReference(reference);
  if (!ticketId) return invalid;
  try {
    const collection = await getTicketsCollection();
    const summaries = await getParticipantSummariesCollection();
    const client = await getClient();
    let ticket: Ticket | null = null;
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        ticket = await collection.findOneAndUpdate(
          { orgId, ticketId, status: "ACTIVE", checkedInAt: null },
          { $set: { status: "CHECKED_IN", checkedInAt: new Date() } },
          { returnDocument: "after", session },
        );
        if (ticket) {
          await summaries.updateOne(
            { orgId, email: ticket.email },
            { $inc: { activeTicketCount: -1, checkedInTicketCount: 1 } },
            { session },
          );
        }
      });
    });
    if (ticket) {
      revalidatePath("/dashboard/lottery");
      revalidatePath("/dashboard/participants");
      return ticketResult(ticket, "redeemed");
    }
    // This read only explains a failed conditional write; it never authorizes one.
    const current = await collection.findOne({ orgId, ticketId });
    return current ? ticketResult(current) : invalid;
  } catch {
    return { outcome: "error", message: "Could not confirm redemption. Look up the Reference again to check its current status." };
  }
}

class ParticipantSummaryMismatchError extends Error {}

export async function cancelTicketReference(reference: string): Promise<RedemptionResult> {
  const { orgId, userId } = await requireRole("org:admin");
  const ticketId = normalizeReference(reference);
  if (!ticketId) return invalid;
  try {
    const collection = await getTicketsCollection();
    const summaries = await getParticipantSummariesCollection();
    const client = await getClient();
    const ticket = await client.withSession((session) =>
      session.withTransaction(async () => {
        const canceled = await collection.findOneAndUpdate(
          { orgId, ticketId, status: "ACTIVE", checkedInAt: null },
          { $set: { status: "CANCELED", canceledAt: new Date(), canceledBy: userId } },
          { returnDocument: "after", session },
        );
        if (!canceled) return null;

        const summary = await summaries.updateOne(
          { orgId, email: canceled.email, activeTicketCount: { $gt: 0 } },
          { $inc: { activeTicketCount: -1 } },
          { session },
        );
        if (summary.matchedCount === 0) {
          throw new ParticipantSummaryMismatchError("Active ticket is missing from the participant summary");
        }
        return canceled;
      })
    );
    if (ticket) {
      revalidatePath("/dashboard/lottery");
      revalidatePath("/dashboard/participants");
      return ticketResult(ticket, "canceled");
    }
    const current = await collection.findOne({ orgId, ticketId });
    return current ? ticketResult(current) : invalid;
  } catch (error) {
    if (error instanceof ParticipantSummaryMismatchError) {
      return {
        outcome: "error",
        message: "The ticket is still active. Contact support to repair the participant summary before retrying.",
      };
    }
    return { outcome: "error", message: "Could not confirm cancellation. Look up the Reference again to check its current status." };
  }
}
