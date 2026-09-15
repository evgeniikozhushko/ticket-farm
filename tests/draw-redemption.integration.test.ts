import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailDispatch, Lottery, Registrant, Ticket } from "@/lib/types";

// Opt-in, disposable LOCAL replica set only. Never uses the app's database URI.
const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;
const hooks = vi.hoisted(() => ({ dispatch: vi.fn(), failOutbox: false }));
vi.mock("@/lib/authz", () => ({ requireRole: async () => ({ orgId: "org_a", userId: "staff" }), requireActiveSub: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrganization: async () => ({ name: "Org A", timezone: "America/Edmonton", emailFromAddress: "hello@ticketfarm.ca", emailFromName: "Org A" }) }));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-09-14" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email-dispatch-outbox", () => ({ dispatchWinnerEmailEvent: hooks.dispatch }));
vi.mock("@/lib/mongodb", () => ({
  getClient: async () => client,
  getTicketsCollection: async () => db.collection<Ticket>("tickets"),
  getRegistrantsCollection: async () => db.collection<Registrant>("registrants"),
  getLotteriesCollection: async () => db.collection<Lottery>("lotteries"),
  getEmailDispatchesCollection: async () => {
    const collection = db.collection<EmailDispatch>("email_dispatches");
    return {
      findOne: collection.findOne.bind(collection),
      insertOne: (...args: Parameters<typeof collection.insertOne>) => {
        if (hooks.failOutbox) throw new Error("Injected outbox failure");
        return collection.insertOne(...args);
      },
    };
  },
}));

describe.skipIf(!uri)("real MongoDB draw and redemption", () => {
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri!)) throw new Error("A local test MongoDB URI is required");
    client = await MongoClient.connect(uri!);
    db = client.db(`ticket_farm_test_${randomUUID().replaceAll("-", "")}`);
    await db.collection("tickets").createIndex({ ticketId: 1 }, { unique: true });
  });
  afterAll(async () => {
    if (db) await db.dropDatabase(); // Only the random database created above.
    if (client) await client.close();
  });
  beforeEach(async () => {
    hooks.failOutbox = false;
    hooks.dispatch.mockReset().mockResolvedValue(true);
    for (const name of ["registrants", "lotteries", "tickets", "email_dispatches"]) await db.collection(name).deleteMany({});
  });

  async function seedDraw() {
    const entrants = ["Ada", "Lin", "Grace"].map((name) => ({
      _id: new ObjectId(), orgId: "org_a", name, email: `${name}@example.com`, date: "2026-09-14", enteredAt: new Date(),
    }));
    await db.collection("registrants").insertMany(entrants);
    await db.collection("registrants").insertOne({ ...entrants[0], _id: new ObjectId(), orgId: "org_b" });
    await db.collection("lotteries").insertOne({ orgId: "org_a", date: "2026-09-14", status: "OPEN" });
    return entrants;
  }

  it("commits the exact recipient partition and retries exclude a late registration", async () => {
    const entrants = await seedDraw();
    hooks.dispatch.mockImplementation(async () => {
      expect(await db.collection("tickets").countDocuments()).toBe(1);
      expect(await db.collection("email_dispatches").countDocuments()).toBeGreaterThan(0);
      return true;
    });
    const { drawTodayLottery, retryTodayWinnerEmails } = await import("@/lib/actions/lottery-draw.actions");
    expect(await drawTodayLottery(1)).toMatchObject({ success: true });
    const original = (await db.collection<EmailDispatch>("email_dispatches").findOne({ dispatchKind: "draw" }))!;
    const winner = (await db.collection<Ticket>("tickets").findOne({}))!;
    expect(original.payload.tickets.map((t) => t.email)).toEqual([winner.email]);
    expect(original.payload.nonWinners!.map((r) => r.registrantId).sort()).toEqual(entrants.filter((r) => r.email !== winner.email).map((r) => r._id.toString()).sort());
    await db.collection("registrants").insertOne({ orgId: "org_a", date: "2026-09-14", email: "late@example.com", name: "Late", enteredAt: new Date() });
    const alreadySent = original.payload.nonWinners![0];
    await db.collection("registrants").updateOne({ _id: new ObjectId(alreadySent.registrantId) }, { $set: { nonWinnerEmailSent: true } });
    await db.collection("tickets").updateOne({ _id: winner._id }, { $set: { emailSent: true } });
    expect(await retryTodayWinnerEmails()).toMatchObject({ success: true, queued: 1 });
    const retry = (await db.collection<EmailDispatch>("email_dispatches").findOne({ dispatchKind: "manual_retry" }))!;
    expect(retry.payload.tickets).toEqual([]);
    expect(retry.payload.nonWinners).toEqual(original.payload.nonWinners!.filter((r) => r.registrantId !== alreadySent.registrantId));
  });

  it("rolls tickets, results, and notifications back together when outbox persistence fails", async () => {
    await seedDraw();
    hooks.failOutbox = true;
    const { drawTodayLottery } = await import("@/lib/actions/lottery-draw.actions");
    expect(await drawTodayLottery(1)).toMatchObject({ success: false });
    expect(await db.collection("tickets").countDocuments()).toBe(0);
    expect(await db.collection("email_dispatches").countDocuments()).toBe(0);
    expect(await db.collection("lotteries").findOne({ orgId: "org_a" })).toMatchObject({ status: "OPEN" });
    expect(hooks.dispatch).not.toHaveBeenCalled();
  });

  it("allows exactly one simultaneous redemption and preserves its timestamp on retry", async () => {
    await seedDraw();
    const { drawTodayLottery } = await import("@/lib/actions/lottery-draw.actions");
    await drawTodayLottery(1);
    const ticket = (await db.collection<Ticket>("tickets").findOne({}))!;
    const { redeemTicketReference } = await import("@/lib/actions/ticket-redemption.actions");
    const results = await Promise.all([redeemTicketReference(ticket.ticketId), redeemTicketReference(ticket.ticketId)]);
    expect(results.map((r) => r.outcome).sort()).toEqual(["already_redeemed", "redeemed"]);
    const checkedIn = (await db.collection<Ticket>("tickets").findOne({ _id: ticket._id }))!;
    expect(checkedIn.status).toBe("CHECKED_IN");
    expect(checkedIn.checkedInAt).toBeInstanceOf(Date);
    expect(await redeemTicketReference(ticket.ticketId)).toMatchObject({ outcome: "already_redeemed" });
    expect((await db.collection<Ticket>("tickets").findOne({ _id: ticket._id }))!.checkedInAt).toEqual(checkedIn.checkedInAt);
  });

  it("cannot look up or redeem another organization's ticket", async () => {
    await db.collection("tickets").insertOne({ orgId: "org_b", ticketId: "4ISW51HA9O0Z", status: "ACTIVE" });
    const { lookupTicketReference, redeemTicketReference } = await import("@/lib/actions/ticket-redemption.actions");
    expect(await lookupTicketReference("4ISW51HA9O0Z")).toMatchObject({ outcome: "invalid" });
    expect(await redeemTicketReference("4ISW51HA9O0Z")).toMatchObject({ outcome: "invalid" });
    expect(await db.collection("tickets").findOne({ orgId: "org_b" })).toMatchObject({ status: "ACTIVE" });
  });
});
