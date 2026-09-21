import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailDispatch } from "@/lib/types";

const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getEmailDispatchesCollection: async () => db.collection<EmailDispatch>("email_dispatches"),
}));
vi.mock("@/inngest/client", () => ({ inngest: { send: sendMock } }));

describe.skipIf(!uri)("real MongoDB email dispatch lease", () => {
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri!)) {
      throw new Error("A local test MongoDB URI is required");
    }
    client = await MongoClient.connect(uri!);
    db = client.db(`ticket_farm_test_${randomUUID().replaceAll("-", "")}`);
    await db.collection("email_dispatches").createIndex({ status: 1, updatedAt: 1 });
  });

  afterAll(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });

  beforeEach(async () => {
    sendMock.mockReset();
    await db.collection("email_dispatches").deleteMany({});
  });

  it("reclaims only an expired claim and fences the original worker", async () => {
    const _id = new ObjectId();
    await db.collection<EmailDispatch>("email_dispatches").insertOne({
      _id,
      orgId: "org_1",
      date: "2026-09-20",
      eventName: "lottery/draw.completed",
      dispatchKind: "draw",
      payload: { orgId: "org_1", date: "2026-09-20", tickets: [] },
      status: "pending",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let releaseFirst!: () => void;
    let firstSendStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstSendStarted = resolve; });
    sendMock.mockImplementationOnce(() => new Promise<void>((resolve) => {
      releaseFirst = resolve;
      firstSendStarted();
    })).mockResolvedValueOnce(undefined);
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");
    const first = dispatchWinnerEmailEvent({ dispatchId: _id });
    await started;

    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    expect(await dispatchWinnerEmailEvent({ dispatchId: _id, staleBefore, maxAttempts: 10 })).toBe(false);
    await db.collection("email_dispatches").updateOne(
      { _id }, { $set: { updatedAt: new Date(staleBefore.getTime() - 1) } },
    );

    expect(await dispatchWinnerEmailEvent({ dispatchId: _id, staleBefore, maxAttempts: 10 })).toBe(true);
    releaseFirst();
    await first;

    const dispatch = await db.collection<EmailDispatch>("email_dispatches").findOne({ _id });
    expect(dispatch).toMatchObject({ status: "dispatched", attempts: 2 });
    expect(dispatch?.claimToken).toBeUndefined();
    expect(sendMock.mock.calls.map(([event]) => event.id)).toEqual([
      `winner-email-dispatch:${_id.toString()}`,
      `winner-email-dispatch:${_id.toString()}`,
    ]);
  });
});
