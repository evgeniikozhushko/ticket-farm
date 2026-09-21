import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultEmailRecipient, Ticket } from "@/lib/types";

const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;
const sendWinner = vi.hoisted(() => vi.fn());
const sendNonWinner = vi.hoisted(() => vi.fn());
const hooks = vi.hoisted(() => ({ failAcceptanceWrite: false }));

vi.mock("@/lib/email", () => ({
  sendWinnerEmail: sendWinner,
  sendNonWinnerEmail: sendNonWinner,
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => db,
  getResultEmailRecipientsCollection: async () => {
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    return {
      find: collection.find.bind(collection),
      findOne: collection.findOne.bind(collection),
      findOneAndUpdate: collection.findOneAndUpdate.bind(collection),
      updateOne: (...args: Parameters<typeof collection.updateOne>) => {
        if (hooks.failAcceptanceWrite && !Array.isArray(args[1]) && args[1].$set?.status === "accepted") {
          throw new Error("Injected database write failure");
        }
        return collection.updateOne(...args);
      },
    };
  },
  getTicketsCollection: async () => db.collection<Ticket>("tickets"),
  getRegistrantsCollection: async () => db.collection("registrants"),
}));

describe.skipIf(!uri)("result email delivery with real local MongoDB", () => {
  const drawDispatchId = new ObjectId();
  beforeAll(async () => {
    if (!/^mongodb:\/\/(127\.0\.0\.1|localhost):\d+\//.test(uri!)) throw new Error("A local test MongoDB URI is required");
    client = await MongoClient.connect(uri!);
    db = client.db(`ticket_farm_test_${randomUUID().replaceAll("-", "")}`);
  });
  afterAll(async () => {
    if (db) await db.dropDatabase();
    if (client) await client.close();
  });
  beforeEach(async () => {
    sendWinner.mockReset();
    sendNonWinner.mockReset();
    hooks.failAcceptanceWrite = false;
    await db.collection("result_email_recipients").deleteMany({});
    await db.collection("tickets").deleteMany({});
    await db.collection("registrants").deleteMany({});
    await db.collection("result_email_send_pace").deleteMany({});
  });

  async function seed(ticketId = "TICKET001") {
    const now = new Date();
    const recipient: ResultEmailRecipient = {
      _id: new ObjectId(), drawDispatchId, orgId: "org_a", date: "2026-09-14",
      kind: "winner", recipientId: ticketId,
      ticket: {
        recipientRecordId: "", name: "Ada", email: "ada@example.com", ticketNumber: 1,
        ticketId, date: "2026-09-14", pickupTime: "5 PM", orgName: "Org A",
        emailFromName: "Org A", emailFromAddress: "hello@ticketfarm.ca",
      },
      status: "pending", attempts: 0, createdAt: now, updatedAt: now,
    };
    recipient.ticket!.recipientRecordId = recipient._id!.toString();
    await db.collection<ResultEmailRecipient>("result_email_recipients").insertOne(recipient);
    await db.collection<Ticket>("tickets").insertOne({
      orgId: "org_a", date: "2026-09-14", ticketId, ticketNumber: 1, name: "Ada",
      email: "ada@example.com", pickupTime: "5 PM", status: "ACTIVE", generatedAt: now,
    });
    return recipient;
  }

  it("allows only one overlapping worker to send a recipient", async () => {
    const recipient = await seed();
    let release!: () => void;
    let started!: () => void;
    const inProvider = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    sendWinner.mockImplementation(async () => {
      started();
      await wait;
      return { success: true, email: "ada@example.com", messageId: "msg_1" };
    });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    const first = processResultEmailBatch(drawDispatchId.toString());
    await inProvider;
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ sent: 0, skipped: 1 });
    release();
    expect(await first).toMatchObject({ sent: 1 });
    expect(sendWinner).toHaveBeenCalledOnce();
    expect(await db.collection<ResultEmailRecipient>("result_email_recipients").findOne({ _id: recipient._id }))
      .toMatchObject({ status: "accepted", messageId: "msg_1", attempts: 1 });
    expect(await db.collection<Ticket>("tickets").findOne({ ticketId: "TICKET001" }))
      .toMatchObject({ emailSent: true, emailMessageId: "msg_1" });
  });

  it("retries a provider failure and keeps the accepted result", async () => {
    const recipient = await seed();
    sendWinner.mockResolvedValueOnce({ success: false, email: "ada@example.com", error: "429" })
      .mockResolvedValueOnce({ success: true, email: "ada@example.com", messageId: "msg_1" });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ failed: 1 });
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ sent: 1 });
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ skipped: 1 });
    expect(sendWinner).toHaveBeenCalledTimes(2);
    expect(await db.collection<ResultEmailRecipient>("result_email_recipients").findOne({ _id: recipient._id }))
      .toMatchObject({ status: "accepted", attempts: 2 });
    expect(await db.collection<Ticket>("tickets").findOne({ ticketId: "TICKET001" }))
      .toMatchObject({ emailSent: true, emailMessageId: "msg_1" });
  });

  it("reclaims a crashed provider acceptance inside the idempotency window", async () => {
    const recipient = await seed();
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    await collection.updateOne({ _id: recipient._id }, {
      $set: { status: "sending", claimToken: "dead-worker", claimedAt: new Date(Date.now() - 6 * 60 * 1000) },
    });
    sendWinner.mockResolvedValue({ success: true, email: "ada@example.com", messageId: "same-provider-id" });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ sent: 1 });
    expect(await collection.findOne({ _id: recipient._id })).toMatchObject({ status: "accepted", messageId: "same-provider-id" });
  });

  it("retries after provider acceptance when the acceptance write fails", async () => {
    const recipient = await seed();
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    sendWinner.mockResolvedValue({ success: true, email: "ada@example.com", messageId: "same-provider-id" });
    hooks.failAcceptanceWrite = true;
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    await expect(processResultEmailBatch(drawDispatchId.toString())).rejects.toThrow("Injected database write failure");
    expect(await collection.findOne({ _id: recipient._id })).toMatchObject({ status: "sending", attempts: 1 });
    hooks.failAcceptanceWrite = false;
    await collection.updateOne({ _id: recipient._id }, { $set: { claimedAt: new Date(Date.now() - 6 * 60 * 1000) } });
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ sent: 1 });
    expect(sendWinner).toHaveBeenCalledTimes(2);
    expect(await collection.findOne({ _id: recipient._id })).toMatchObject({ status: "accepted", messageId: "same-provider-id" });
  });

  it("holds an ambiguous send past the provider idempotency window", async () => {
    const recipient = await seed();
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    await collection.updateOne({ _id: recipient._id }, {
      $set: { status: "sending", claimToken: "dead-worker", claimedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ uncertain: 1 });
    expect(sendWinner).not.toHaveBeenCalled();
    expect(await collection.findOne({ _id: recipient._id })).toMatchObject({ status: "uncertain" });
  });

  it("uses the first attempt time even if a later retry refreshed the claim", async () => {
    const recipient = await seed();
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    await collection.updateOne({ _id: recipient._id }, {
      $set: {
        status: "sending", claimToken: "recent-worker",
        firstAttemptAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        claimedAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ uncertain: 1 });
    expect(sendWinner).not.toHaveBeenCalled();
  });

  it("reserves a shared one-second gap for parallel send requests", async () => {
    const { waitForResultEmailSendSlot } = await import("@/lib/email-send-pace");
    const started = Date.now();
    await Promise.all([waitForResultEmailSendSlot(), waitForResultEmailSendSlot()]);
    expect(Date.now() - started).toBeGreaterThanOrEqual(850);
    expect(await db.collection("result_email_send_pace").countDocuments()).toBe(1);
  });

  it("processes at most five snapshot records per checkpoint", async () => {
    for (let index = 0; index < 6; index++) await seed(`TICKET${index}`);
    sendWinner.mockResolvedValue({ success: true, email: "ada@example.com", messageId: "msg" });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    const first = await processResultEmailBatch(drawDispatchId.toString());
    expect(first).toMatchObject({ sent: 5, done: false });
    expect(sendWinner).toHaveBeenCalledTimes(5);
    const second = await processResultEmailBatch(drawDispatchId.toString(), first.lastId);
    expect(second).toMatchObject({ sent: 1, done: true });
  });

  it("sends non-winners from the committed recipient snapshot", async () => {
    const registrantId = new ObjectId();
    await db.collection("registrants").insertOne({
      _id: registrantId, orgId: "org_a", date: "2026-09-14",
      name: "Lin", email: "lin@example.com", enteredAt: new Date(),
    });
    await db.collection<ResultEmailRecipient>("result_email_recipients").insertOne({
      drawDispatchId, orgId: "org_a", date: "2026-09-14", kind: "non_winner",
      recipientId: registrantId.toString(), nonWinner: {
        registrantId: registrantId.toString(), email: "lin@example.com", date: "2026-09-14",
        orgName: "Org A", emailFromName: "Org A", emailFromAddress: "hello@ticketfarm.ca",
      },
      status: "pending", attempts: 0, createdAt: new Date(), updatedAt: new Date(),
    });
    sendNonWinner.mockResolvedValue({ success: true, email: "lin@example.com", messageId: "msg_nw" });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    expect(await processResultEmailBatch(drawDispatchId.toString())).toMatchObject({ sent: 1 });
    expect(sendNonWinner).toHaveBeenCalledOnce();
    expect(await db.collection("registrants").findOne({ _id: registrantId }))
      .toMatchObject({ nonWinnerEmailSent: true, nonWinnerEmailMessageId: "msg_nw" });
  });
});
