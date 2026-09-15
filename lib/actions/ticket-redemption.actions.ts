"use server";

import { requireRole } from "@/lib/authz";
import { getTicketsCollection } from "@/lib/mongodb";
import type { Ticket } from "@/lib/types";
import { revalidatePath } from "next/cache";

export type RedemptionResult =
  | { outcome: "invalid" | "error"; message: string }
  | {
      outcome: "active" | "redeemed" | "already_redeemed" | "inactive";
      ticket: { ticketId: string; ticketNumber: number; name: string; date: string; pickupTime: string; checkedInAt?: string };
    };

function normalizeReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reference = value.trim().toUpperCase();
  return /^[0-9A-Z]{12}$/.test(reference) ? reference : null;
}

function ticketResult(ticket: Ticket, redeemed = false): RedemptionResult {
  return {
    outcome: redeemed ? "redeemed" : ticket.status === "CHECKED_IN" || ticket.checkedInAt
      ? "already_redeemed" : ticket.status === "ACTIVE" ? "active" : "inactive",
    ticket: {
      ticketId: ticket.ticketId, ticketNumber: ticket.ticketNumber,
      name: ticket.name, date: ticket.date, pickupTime: ticket.pickupTime,
      checkedInAt: ticket.checkedInAt?.toISOString(),
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
    const ticket = await collection.findOneAndUpdate(
      { orgId, ticketId, status: "ACTIVE", checkedInAt: null },
      { $set: { status: "CHECKED_IN", checkedInAt: new Date() } },
      { returnDocument: "after" },
    );
    if (ticket) {
      revalidatePath("/dashboard/lottery");
      revalidatePath("/dashboard/participants");
      return ticketResult(ticket, true);
    }
    // This read only explains a failed conditional write; it never authorizes one.
    const current = await collection.findOne({ orgId, ticketId });
    return current ? ticketResult(current) : invalid;
  } catch {
    return { outcome: "error", message: "Could not confirm redemption. Look up the Reference again to check its current status." };
  }
}
