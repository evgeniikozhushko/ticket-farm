import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const collection = vi.hoisted(() => ({ findOne: vi.fn(), findOneAndUpdate: vi.fn() }));
const summaries = vi.hoisted(() => ({ updateOne: vi.fn() }));
const client = vi.hoisted(() => ({ withSession: async (callback: (session: unknown) => unknown) => callback({ withTransaction: async (transaction: (session: unknown) => unknown) => transaction({}) }) }));
vi.mock("@/lib/authz", () => ({ requireRole: auth }));
vi.mock("@/lib/mongodb", () => ({ getClient: async () => client, getTicketsCollection: async () => collection, getParticipantSummariesCollection: async () => summaries }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { cancelTicketReference, lookupTicketReference, redeemTicketReference } from "@/lib/actions/ticket-redemption.actions";

const ticket = {
  orgId: "org_a", ticketId: "4ISW51HA9O0Z", ticketNumber: 27,
  name: "Ada", email: "private@example.com", date: "2026-09-14",
  pickupTime: "5 PM", status: "ACTIVE",
};

describe("staff reference redemption", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.mockResolvedValue({ orgId: "org_a", userId: "staff" });
  });
  it("requires authorization on both actions", async () => {
    auth.mockRejectedValue(new Error("Unauthorized"));
    await expect(lookupTicketReference(ticket.ticketId)).rejects.toThrow("Unauthorized");
    await expect(redeemTicketReference(ticket.ticketId)).rejects.toThrow("Unauthorized");
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("normalizes a reference and limits confirmation data", async () => {
    collection.findOne.mockResolvedValue(ticket);
    const result = await lookupTicketReference(" 4isw51ha9o0z \n");
    expect(collection.findOne).toHaveBeenCalledWith({ orgId: "org_a", ticketId: ticket.ticketId });
    expect(result).toMatchObject({ outcome: "active", ticket: { ticketNumber: 27 } });
    expect(JSON.stringify(result)).not.toContain(ticket.email);
  });
  it.each(["27", "#27", "", "4ISW51HA9O0Z-extra"])("rejects invalid credential %s without querying", async (reference) => {
    expect(await redeemTicketReference(reference)).toMatchObject({ outcome: "invalid" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
  });
  it("treats another organization's reference as not found", async () => {
    collection.findOne.mockResolvedValue(null);
    collection.findOneAndUpdate.mockResolvedValue(null);
    expect(await redeemTicketReference(ticket.ticketId)).toMatchObject({ outcome: "invalid" });
    expect(collection.findOne).toHaveBeenCalledWith({ orgId: "org_a", ticketId: ticket.ticketId });
  });
  it("uses one conditional write, records status and time, and does not read first", async () => {
    collection.findOneAndUpdate.mockResolvedValue({ ...ticket, status: "CHECKED_IN", checkedInAt: new Date() });
    expect(await redeemTicketReference(ticket.ticketId)).toMatchObject({ outcome: "redeemed" });
    expect(collection.findOneAndUpdate).toHaveBeenCalledWith(
      { orgId: "org_a", ticketId: ticket.ticketId, status: "ACTIVE", checkedInAt: null },
      { $set: { status: "CHECKED_IN", checkedInAt: expect.any(Date) } },
      expect.objectContaining({ returnDocument: "after" }),
    );
    expect(collection.findOne).not.toHaveBeenCalled();
    expect(auth).toHaveBeenCalledWith("org:member");
  });
  it.each([ ["CHECKED_IN", "already_redeemed"], ["CANCELED", "already_canceled"] ])("explains %s without another write", async (status, outcome) => {
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue({ ...ticket, status });
    expect(await redeemTicketReference(ticket.ticketId)).toMatchObject({ outcome });
    expect(collection.findOneAndUpdate).toHaveBeenCalledOnce();
  });
});

describe("admin reference cancellation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    auth.mockResolvedValue({ orgId: "org_a", userId: "admin" });
  });

  it("requires an organization admin before accessing tickets", async () => {
    auth.mockRejectedValue(new Error("Forbidden: admin role required"));
    await expect(cancelTicketReference(ticket.ticketId)).rejects.toThrow("Forbidden: admin role required");
    expect(auth).toHaveBeenCalledWith("org:admin");
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it("rejects an invalid Reference without querying", async () => {
    expect(await cancelTicketReference("27")).toMatchObject({ outcome: "invalid" });
    expect(collection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it("treats another organization's Reference as not found", async () => {
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue(null);
    expect(await cancelTicketReference(ticket.ticketId)).toMatchObject({ outcome: "invalid" });
    expect(collection.findOne).toHaveBeenCalledWith({ orgId: "org_a", ticketId: ticket.ticketId });
    expect(summaries.updateOne).not.toHaveBeenCalled();
  });

  it("writes the audit fields and decrements the active count in the same session", async () => {
    const canceledAt = new Date();
    collection.findOneAndUpdate.mockResolvedValue({ ...ticket, status: "CANCELED", canceledAt, canceledBy: "admin" });
    summaries.updateOne.mockResolvedValue({ matchedCount: 1 });

    expect(await cancelTicketReference(" 4isw51ha9o0z ")).toMatchObject({
      outcome: "canceled",
      ticket: { canceledAt: canceledAt.toISOString() },
    });
    expect(collection.findOneAndUpdate).toHaveBeenCalledExactlyOnceWith(
      { orgId: "org_a", ticketId: ticket.ticketId, status: "ACTIVE", checkedInAt: null },
      { $set: { status: "CANCELED", canceledAt: expect.any(Date), canceledBy: "admin" } },
      { returnDocument: "after", session: expect.any(Object) },
    );
    expect(summaries.updateOne).toHaveBeenCalledExactlyOnceWith(
      { orgId: "org_a", email: ticket.email, activeTicketCount: { $gt: 0 } },
      { $inc: { activeTicketCount: -1 } },
      { session: collection.findOneAndUpdate.mock.calls[0][2].session },
    );
    expect(summaries.updateOne.mock.calls[0][2].session).toBe(collection.findOneAndUpdate.mock.calls[0][2].session);
    expect(collection.findOne).not.toHaveBeenCalled();
  });

  it("explains that the participant summary needs repair when the update matches nothing", async () => {
    collection.findOneAndUpdate.mockResolvedValue({ ...ticket, status: "CANCELED" });
    summaries.updateOne.mockResolvedValue({ matchedCount: 0 });

    expect(await cancelTicketReference(ticket.ticketId)).toEqual({
      outcome: "error",
      message: "The ticket is still active. Contact support to repair the participant summary before retrying.",
    });
  });

  it("preserves the generic message for an unexpected write failure", async () => {
    collection.findOneAndUpdate.mockRejectedValue(new Error("Database unavailable"));

    expect(await cancelTicketReference(ticket.ticketId)).toEqual({
      outcome: "error",
      message: "Could not confirm cancellation. Look up the Reference again to check its current status.",
    });
  });

  it.each([["CHECKED_IN", "already_redeemed"], ["CANCELED", "already_canceled"]])(
    "explains %s without another write",
    async (status, outcome) => {
      collection.findOneAndUpdate.mockResolvedValue(null);
      collection.findOne.mockResolvedValue({ ...ticket, status });
      expect(await cancelTicketReference(ticket.ticketId)).toMatchObject({ outcome });
      expect(collection.findOneAndUpdate).toHaveBeenCalledOnce();
      expect(summaries.updateOne).not.toHaveBeenCalled();
    },
  );
});
