import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => vi.fn());
const collection = vi.hoisted(() => ({ findOne: vi.fn(), findOneAndUpdate: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireRole: auth }));
vi.mock("@/lib/mongodb", () => ({ getTicketsCollection: async () => collection }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { lookupTicketReference, redeemTicketReference } from "@/lib/actions/ticket-redemption.actions";

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
      { returnDocument: "after" },
    );
    expect(collection.findOne).not.toHaveBeenCalled();
  });
  it.each([ ["CHECKED_IN", "already_redeemed"], ["CANCELED", "inactive"] ])("explains %s without another write", async (status, outcome) => {
    collection.findOneAndUpdate.mockResolvedValue(null);
    collection.findOne.mockResolvedValue({ ...ticket, status });
    expect(await redeemTicketReference(ticket.ticketId)).toMatchObject({ outcome });
    expect(collection.findOneAndUpdate).toHaveBeenCalledOnce();
  });
});
