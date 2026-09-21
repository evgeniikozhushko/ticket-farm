import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const summaries = vi.hoisted(() => ({ find: vi.fn() }));
const registrants = vi.hoisted(() => ({ find: vi.fn() }));
const tickets = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requireRole: requireRoleMock }));
vi.mock("@/lib/mongodb", () => ({
  getParticipantSummariesCollection: async () => summaries,
  getRegistrantsCollection: async () => registrants,
  getTicketsCollection: async () => tickets,
}));

function cursor<T>(rows: T[]) { return { sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rows) })) })) }; }
async function load() { vi.resetModules(); return import("@/lib/actions/participants.actions"); }

describe("participant actions", () => {
  beforeEach(() => {
    requireRoleMock.mockResolvedValue({ orgId: "org_1" });
    summaries.find.mockReset(); registrants.find.mockReset(); tickets.find.mockReset();
  });
  it("reads a bounded, email-ordered summary page", async () => {
    summaries.find.mockReturnValue(cursor([{ orgId: "org_1", email: "ada@example.com", normalizedName: "ada", latestName: "Ada", entryCount: 1, firstEnteredAt: new Date(), lastEnteredAt: new Date(), winCount: 0, activeTicketCount: 0, checkedInTicketCount: 0 }]));
    const { listOrgParticipants } = await load();
    await expect(listOrgParticipants({ limit: 20 })).resolves.toMatchObject({ participants: [{ email: "ada@example.com" }] });
    expect(summaries.find).toHaveBeenCalledWith({ orgId: "org_1" });
  });
  it("uses the normalized-name index path for name prefix search", async () => {
    summaries.find.mockReturnValue(cursor([]));
    const { listOrgParticipants } = await load();
    await listOrgParticipants({ search: "Ada", limit: 10 });
    expect(summaries.find).toHaveBeenCalledWith({ orgId: "org_1", normalizedName: { $regex: "^ada" } });
  });
  it("bounds participant history and only loads tickets for its page", async () => {
    const enteredAt = new Date();
    registrants.find.mockReturnValue(cursor([{ orgId: "org_1", email: "ada@example.com", date: "2026-09-20", enteredAt, name: "Ada" }]));
    tickets.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) });
    const { getParticipantHistory } = await load();
    await expect(getParticipantHistory(" ADA@example.com ")).resolves.toEqual({ entries: [{ date: "2026-09-20", enteredAt, won: false, ticketNumber: undefined, ticketId: undefined, ticketStatus: undefined, checkedInAt: undefined, emailSent: undefined, emailError: undefined, emailDelivery: undefined }] });
    expect(registrants.find).toHaveBeenCalledWith({ orgId: "org_1", email: "ada@example.com" });
    expect(tickets.find).toHaveBeenCalledWith({ orgId: "org_1", email: "ada@example.com", date: { $in: ["2026-09-20"] } });
  });
});
