import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());
const dispatchWinnerEmailEventMock = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  withTransaction: vi.fn((fn: () => Promise<void>) => fn()),
}));
const client = vi.hoisted(() => ({
  withSession: vi.fn((fn: (sessionArg: typeof session) => Promise<void>) => fn(session)),
}));
const lotteriesCollection = vi.hoisted(() => ({
  updateOne: vi.fn(),
}));
const registrantsCollection = vi.hoisted(() => ({
  find: vi.fn(),
}));
const ticketsCollection = vi.hoisted(() => ({
  insertMany: vi.fn(),
}));
const dispatchesCollection = vi.hoisted(() => ({
  insertOne: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  requireRole: requireRoleMock,
  requireActiveSub: vi.fn(() => undefined),
}));

vi.mock("@/lib/actions/org.actions", () => ({
  getOrganization: getOrganizationMock,
}));

vi.mock("@/lib/email-dispatch-outbox", () => ({
  dispatchWinnerEmailEvent: dispatchWinnerEmailEventMock,
}));

vi.mock("@/lib/date", () => ({
  getTodayDateString: vi.fn(() => "2026-05-28"),
}));

vi.mock("@/lib/mongodb", () => ({
  getClient: vi.fn(() => Promise.resolve(client)),
  getLotteriesCollection: vi.fn(() => Promise.resolve(lotteriesCollection)),
  getRegistrantsCollection: vi.fn(() => Promise.resolve(registrantsCollection)),
  getTicketsCollection: vi.fn(() => Promise.resolve(ticketsCollection)),
  getEmailDispatchesCollection: vi.fn(() => Promise.resolve(dispatchesCollection)),
}));

async function loadAction() {
  vi.resetModules();
  return import("@/lib/actions/lottery-draw.actions");
}

describe("drawTodayLottery", () => {
  beforeEach(() => {
    requireRoleMock.mockReset().mockResolvedValue({ orgId: "org_1" });
    getOrganizationMock.mockReset().mockResolvedValue({
      clerkOrgId: "org_1",
      name: "Ticket Farm",
      timezone: "America/Edmonton",
      subscriptionStatus: "active",
      emailFromAddress: "hello@ticketfarm.ca",
      emailFromName: "Ticket Farm",
    });
    dispatchWinnerEmailEventMock.mockReset().mockResolvedValue(true);
    client.withSession.mockClear();
    session.withTransaction.mockClear();
    lotteriesCollection.updateOne.mockReset();
    registrantsCollection.find.mockReset();
    ticketsCollection.insertMany.mockReset().mockResolvedValue({ insertedCount: 2 });
    dispatchesCollection.insertOne.mockReset().mockResolvedValue({ insertedId: new ObjectId() });
  });

  it("returns already drawn when the draw lock cannot be acquired", async () => {
    lotteriesCollection.updateOne.mockResolvedValue({ matchedCount: 0 });
    const { drawTodayLottery } = await loadAction();

    await expect(drawTodayLottery(1)).resolves.toEqual({
      success: false,
      error: "Lottery already drawn for today.",
    });
    expect(ticketsCollection.insertMany).not.toHaveBeenCalled();
    expect(dispatchWinnerEmailEventMock).not.toHaveBeenCalled();
  });

  it("returns already drawn when a duplicate draw write is detected", async () => {
    const registrants = [
      { _id: new ObjectId(), orgId: "org_1", name: "Ada", email: "ada@example.com", date: "2026-05-28", enteredAt: new Date("2026-05-28T12:00:00Z") },
    ];
    lotteriesCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
    registrantsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(registrants) });
    ticketsCollection.insertMany.mockRejectedValue({ code: 11000 });
    const { drawTodayLottery } = await loadAction();

    await expect(drawTodayLottery(1)).resolves.toEqual({
      success: false,
      error: "Lottery already drawn for today.",
    });
    expect(dispatchWinnerEmailEventMock).not.toHaveBeenCalled();
  });

  it("creates tickets and dispatches the email event only once after commit", async () => {
    const registrants = [
      { _id: new ObjectId(), orgId: "org_1", name: "Ada", email: "ada@example.com", date: "2026-05-28", enteredAt: new Date("2026-05-28T12:00:00Z") },
      { _id: new ObjectId(), orgId: "org_1", name: "Lin", email: "lin@example.com", date: "2026-05-28", enteredAt: new Date("2026-05-28T12:01:00Z") },
    ];
    lotteriesCollection.updateOne.mockResolvedValue({ matchedCount: 1 });
    registrantsCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(registrants) });
    const { drawTodayLottery } = await loadAction();

    const result = await drawTodayLottery(2);

    expect(result.success).toBe(true);
    expect(ticketsCollection.insertMany).toHaveBeenCalledOnce();
    expect(dispatchesCollection.insertOne).toHaveBeenCalledOnce();
    expect(dispatchWinnerEmailEventMock).toHaveBeenCalledOnce();
    expect(dispatchWinnerEmailEventMock).toHaveBeenCalledWith({ orgId: "org_1", date: "2026-05-28" });
  });
});
