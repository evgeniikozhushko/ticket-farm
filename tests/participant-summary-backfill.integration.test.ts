import { randomUUID } from "node:crypto";
import { MongoClient, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { backfillParticipantSummaries } from "@/scripts/backfill-participant-summaries";

// Opt-in, disposable LOCAL replica set only. Never uses the app's database URI.
const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;

describe.skipIf(!uri)("participant summary backfill with real MongoDB", () => {
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri!)) {
      throw new Error("A local test MongoDB URI is required");
    }
    client = await MongoClient.connect(uri!);
    db = client.db(`ticket_farm_test_${randomUUID().replaceAll("-", "")}`);
    await db.collection("participant_summaries").createIndex(
      { orgId: 1, email: 1 },
      { unique: true },
    );
    await db.collection("participant_summaries").createIndex({
      orgId: 1,
      normalizedName: 1,
      email: 1,
    });
  });

  afterAll(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });

  beforeEach(async () => {
    for (const name of ["registrants", "tickets", "participant_summaries"]) {
      await db.collection(name).deleteMany({});
    }
  });

  it("replaces stale summaries and is idempotent across organizations and ticket states", async () => {
    const first = new Date("2026-09-12T10:00:00.000Z");
    const second = new Date("2026-09-14T12:00:00.000Z");
    const otherOrg = new Date("2026-09-13T11:00:00.000Z");
    await db.collection("registrants").insertMany([
      { orgId: "org_a", email: "same@example.com", name: "  Ada Old  ", date: "2026-09-12", enteredAt: first },
      { orgId: "org_a", email: "same@example.com", name: "Ada New", date: "2026-09-14", enteredAt: second },
      { orgId: "org_a", email: "active@example.com", name: "Active Winner", date: "2026-09-14", enteredAt: second },
      { orgId: "org_b", email: "same@example.com", name: "Other Org", date: "2026-09-13", enteredAt: otherOrg },
    ]);
    await db.collection("tickets").insertMany([
      { orgId: "org_a", email: "same@example.com", status: "ACTIVE" },
      { orgId: "org_a", email: "same@example.com", status: "CHECKED_IN" },
      { orgId: "org_a", email: "active@example.com", status: "ACTIVE" },
      { orgId: "org_b", email: "same@example.com", status: "CHECKED_IN" },
    ]);
    await db.collection("participant_summaries").insertOne({
      orgId: "stale_org",
      email: "stale@example.com",
      latestName: "Stale",
      normalizedName: "stale",
      entryCount: 99,
    });

    expect(await backfillParticipantSummaries(db)).toBe(3);
    const firstRun = await db.collection("participant_summaries")
      .find({}, { projection: { _id: 0 } })
      .sort({ orgId: 1, email: 1 })
      .toArray();
    expect(firstRun).toEqual([
      {
        orgId: "org_a",
        email: "active@example.com",
        firstEnteredAt: second,
        lastEnteredAt: second,
        latestName: "Active Winner",
        entryCount: 1,
        normalizedName: "active winner",
        winCount: 1,
        activeTicketCount: 1,
        checkedInTicketCount: 0,
      },
      {
        orgId: "org_a",
        email: "same@example.com",
        firstEnteredAt: first,
        lastEnteredAt: second,
        latestName: "Ada New",
        entryCount: 2,
        normalizedName: "ada new",
        winCount: 2,
        activeTicketCount: 1,
        checkedInTicketCount: 1,
      },
      {
        orgId: "org_b",
        email: "same@example.com",
        firstEnteredAt: otherOrg,
        lastEnteredAt: otherOrg,
        latestName: "Other Org",
        entryCount: 1,
        normalizedName: "other org",
        winCount: 1,
        activeTicketCount: 0,
        checkedInTicketCount: 1,
      },
    ]);

    expect(await backfillParticipantSummaries(db)).toBe(3);
    expect(
      await db.collection("participant_summaries")
        .find({}, { projection: { _id: 0 } })
        .sort({ orgId: 1, email: 1 })
        .toArray(),
    ).toEqual(firstRun);
  });
});
