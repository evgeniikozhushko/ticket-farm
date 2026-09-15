import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { EmailDispatch, Lottery, Registrant, Ticket } from "@/lib/types";

// Opt-in and local only; never use the application's configured database.
const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;
const hooks = vi.hoisted(() => ({
  cap: 100 as number | null,
  failInsert: false,
  beforeClaim: undefined as undefined | (() => Promise<void>),
  afterClaim: undefined as undefined | (() => Promise<void>),
  beforeDraw: undefined as undefined | (() => Promise<void>),
}));
vi.mock("@/lib/org-cache", () => ({
  getOrgBySlug: async () => ({
    clerkOrgId: "org_a",
    maxRegistrantsPerDay: hooks.cap,
    timezone: "America/Edmonton",
  }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10" }),
}));
vi.mock("@/lib/authz", () => ({
  requireRole: async () => ({ orgId: "org_a", userId: "staff" }),
  requireActiveSub: vi.fn(),
}));
vi.mock("@/lib/orgs", () => ({
  getOrganization: async () => ({
    name: "Org A",
    timezone: "America/Edmonton",
    emailFromAddress: "hello@ticketfarm.ca",
    emailFromName: "Org A",
  }),
}));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-09-14" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/email-dispatch-outbox", () => ({
  dispatchWinnerEmailEvent: async () => true,
}));
vi.mock("@/lib/mongodb", () => ({
  getClient: async () => client,
  getPublicRegistrationRateLimitsCollection: async () =>
    db.collection("public_registration_rate_limits"),
  getTicketsCollection: async () => db.collection<Ticket>("tickets"),
  getEmailDispatchesCollection: async () =>
    db.collection<EmailDispatch>("email_dispatches"),
  getRegistrantsCollection: async () => {
    const collection = db.collection<Registrant>("registrants");
    return {
      find: collection.find.bind(collection),
      findOne: collection.findOne.bind(collection),
      countDocuments: collection.countDocuments.bind(collection),
      insertOne: async (...args: Parameters<typeof collection.insertOne>) => {
        if (hooks.failInsert) throw new Error("Injected insert failure");
        return collection.insertOne(...args);
      },
    };
  },
  getLotteriesCollection: async () => {
    const collection = db.collection<Lottery>("lotteries");
    return {
      findOne: collection.findOne.bind(collection),
      updateOne: async (...args: Parameters<typeof collection.updateOne>) => {
        if (!Array.isArray(args[1]) && args[1].$set?.status === "LOTTERY_DRAWN")
          await hooks.beforeDraw?.();
        return collection.updateOne(...args);
      },
      findOneAndUpdate: async (
        ...args: Parameters<typeof collection.findOneAndUpdate>
      ) => {
        await hooks.beforeClaim?.();
        const result = await collection.findOneAndUpdate(...args);
        await hooks.afterClaim?.();
        return result;
      },
    };
  },
}));
import { enterLottery } from "@/lib/actions/lottery.actions";
import { drawTodayLottery } from "@/lib/actions/lottery-draw.actions";
const scope = { orgId: "org_a", date: "2026-09-14" };
function enter(email: string) {
  const form = new FormData();
  form.set("name", "Person");
  form.set("email", email);
  form.set("consent", "true");
  return enterLottery("farm", form);
}
function gate() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function assertCount(expected: number) {
  expect(await db.collection("registrants").countDocuments(scope)).toBe(
    expected,
  );
  expect(await db.collection("lotteries").findOne(scope)).toMatchObject({
    registrantCount: expected,
  });
}
async function assertSnapshot(emails: string[]) {
  const outbox = (await db
    .collection<EmailDispatch>("email_dispatches")
    .findOne({ ...scope, dispatchKind: "draw" }))!;
  expect(outbox).not.toBeNull();
  const recipients = [
    ...outbox.payload.tickets.map((r) => r.email),
    ...outbox.payload.nonWinners!.map((r) => r.email),
  ];
  expect(recipients.sort()).toEqual([...emails].sort());
}

describe.skipIf(!uri)(
  "transactional registration admission with real MongoDB",
  () => {
    beforeAll(async () => {
      if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri!))
        throw new Error("A local test MongoDB URI is required");
      client = await MongoClient.connect(uri!);
      db = client.db(`ticket_farm_test_${randomUUID().replaceAll("-", "")}`);
      await db
        .collection("registrants")
        .createIndex({ orgId: 1, email: 1, date: 1 }, { unique: true });
      await db
        .collection("lotteries")
        .createIndex({ orgId: 1, date: 1 }, { unique: true });
      await db
        .collection("tickets")
        .createIndex({ ticketId: 1 }, { unique: true });
      await db
        .collection("public_registration_rate_limits")
        .createIndex({ key: 1 }, { unique: true });
    });
    afterAll(async () => {
      if (db) await db.dropDatabase();
      if (client) await client.close();
    });
    beforeEach(async () => {
      hooks.cap = 100;
      hooks.failInsert = false;
      hooks.beforeClaim = undefined;
      hooks.afterClaim = undefined;
      hooks.beforeDraw = undefined;
      for (const name of [
        "registrants",
        "lotteries",
        "tickets",
        "email_dispatches",
        "public_registration_rate_limits",
      ])
        await db.collection(name).deleteMany({});
    });

    it("includes admission committed before a competing draw in its recipient snapshot", async () => {
      expect(await enter("seed@example.com")).toEqual({ success: true });
      const claimed = gate();
      const release = gate();
      const drawAttempted = gate();
      hooks.afterClaim = async () => {
        claimed.resolve();
        await release.promise;
      };
      hooks.beforeDraw = async () => {
        drawAttempted.resolve();
      };
      const registration = enter("competing@example.com");
      await claimed.promise;
      const draw = drawTodayLottery(1);
      try {
        await drawAttempted.promise;
      } finally {
        release.resolve();
      }
      expect(await registration).toEqual({ success: true });
      expect(await draw).toMatchObject({ success: true });
      await assertCount(2);
      await assertSnapshot(["seed@example.com", "competing@example.com"]);
    });

    it("retries an admission with an old OPEN snapshot after the draw commits first", async () => {
      expect(await enter("seed@example.com")).toEqual({ success: true });
      const ready = gate();
      const release = gate();
      hooks.beforeClaim = async () => {
        ready.resolve();
        await release.promise;
      };
      const registration = enter("competing@example.com");
      await ready.promise;
      try {
        expect(await drawTodayLottery(1)).toMatchObject({ success: true });
      } finally {
        release.resolve();
      }
      expect(await registration).toEqual({
        success: false,
        error: "Registration is closed for today. Check back tomorrow.",
      });
      await assertCount(1);
      await assertSnapshot(["seed@example.com"]);
    });

    it("includes every successful competing admission in the committed outbox", async () => {
      await enter("seed@example.com");
      const emails = Array.from(
        { length: 8 },
        (_, i) => `race${i}@example.com`,
      );
      const [results, draw] = await Promise.all([
        Promise.all(emails.map(enter)),
        drawTodayLottery(1),
      ]);
      expect(draw).toMatchObject({ success: true });
      const successful = emails.filter((_, i) => results[i].success);
      await assertCount(successful.length + 1);
      await assertSnapshot(["seed@example.com", ...successful]);
    });

    it("rolls back the quota write on insert failure and refunds rate limits", async () => {
      hooks.failInsert = true;
      expect(await enter("failed@example.com")).toMatchObject({
        success: false,
      });
      await assertCount(0);
      expect(
        await db
          .collection("public_registration_rate_limits")
          .countDocuments({ count: { $ne: 0 } }),
      ).toBe(0);
    });

    it("concurrent duplicate requests create one registration and consume one slot", async () => {
      const results = await Promise.all(
        Array.from({ length: 4 }, () => enter("same@example.com")),
      );
      expect(results.filter((r) => r.success)).toHaveLength(1);
      await assertCount(1);
      expect(
        (
          await db
            .collection("public_registration_rate_limits")
            .find()
            .toArray()
        ).map((r) => r.count),
      ).toEqual([1, 1]);
    });

    it("admits exactly N under concurrent demand without exceeding rate limits", async () => {
      hooks.cap = 5;
      const results = await Promise.all(
        Array.from({ length: 12 }, (_, i) => enter(`capacity${i}@example.com`)),
      );
      expect(results.filter((r) => r.success)).toHaveLength(5);
      expect(
        results
          .filter((r) => !r.success)
          .every(
            (r) =>
              r.error ===
              "Registration is full for today. Check back tomorrow.",
          ),
      ).toBe(true);
      await assertCount(5);
    });

    it.each(["CLOSED", "LOTTERY_DRAWN"])(
      "preserves %s and rejects admission",
      async (status) => {
        await db
          .collection("lotteries")
          .insertOne({ ...scope, status, registrantCount: 0 });
        expect(await enter("closed@example.com")).toEqual({
          success: false,
          error: "Registration is closed for today. Check back tomorrow.",
        });
        await assertCount(0);
        expect(await db.collection("lotteries").findOne(scope)).toMatchObject({
          status,
        });
      },
    );

    it("zero capacity admits nobody", async () => {
      hooks.cap = 0;
      expect(await enter("zero@example.com")).toEqual({
        success: false,
        error: "Registration is full for today. Check back tomorrow.",
      });
      await assertCount(0);
    });

    it("unlimited capacity admits all eligible requests", async () => {
      hooks.cap = null;
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => enter(`unlimited${i}@example.com`)),
      );
      expect(results.every((r) => r.success)).toBe(true);
      await assertCount(8);
    });

    it("initializes a missing counter from only the existing organization/day entries", async () => {
      hooks.cap = 3;
      await db.collection("lotteries").insertOne({ ...scope, status: "OPEN" });
      await db.collection("registrants").insertMany([
        { ...scope, email: "old1@example.com" },
        { ...scope, email: "old2@example.com" },
        { ...scope, orgId: "org_b", email: "other@example.com" },
        { ...scope, date: "2026-09-13", email: "yesterday@example.com" },
      ]);
      const results = await Promise.all([
        enter("new1@example.com"),
        enter("new2@example.com"),
      ]);
      expect(results.filter((r) => r.success)).toHaveLength(1);
      await assertCount(3);
    });
  },
);
