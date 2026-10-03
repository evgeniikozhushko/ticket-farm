import { randomUUID } from "node:crypto";
import { MongoClient, ObjectId, type Db } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResultEmailRecipient, Ticket } from "@/lib/types";

const uri = process.env.TICKET_FARM_TEST_MONGODB_URI;
let client: MongoClient;
let db: Db;
const sendWinner = vi.hoisted(() => vi.fn());
const sendNonWinner = vi.hoisted(() => vi.fn());
const verify = vi.hoisted(() => vi.fn());
const sendEvent = vi.hoisted(() => vi.fn());
const hooks = vi.hoisted(() => ({
  failAcceptanceWrite: false,
  beforeProjection: undefined as undefined | (() => Promise<void>),
}));
vi.mock("@/lib/authz", () => ({ requireRole: async () => ({ orgId: "org_a", userId: "staff" }), requireActiveSub: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrganization: async () => ({ name: "Org A", timezone: "America/Edmonton" }) }));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-09-14" }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { webhooks = { verify }; } }));
vi.mock("@/inngest/client", () => ({ inngest: {
  createFunction: (_options: unknown, _trigger: unknown, handler: unknown) => handler,
  send: sendEvent,
} }));

vi.mock("@/lib/email", () => ({
  sendWinnerEmail: sendWinner,
  sendBulkWinnerEmails: vi.fn(),
  sendNonWinnerEmail: sendNonWinner,
}));
vi.mock("@/lib/mongodb", () => ({
  getDb: async () => db,
  getResultEmailRecipientsCollection: async () => {
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    return {
      aggregate: collection.aggregate.bind(collection),
      countDocuments: collection.countDocuments.bind(collection),
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
  getEmailDispatchesCollection: async () => db.collection("email_dispatches"),
  getTicketsCollection: async () => {
    const collection = db.collection<Ticket>("tickets");
    return { updateOne: async (...args: Parameters<typeof collection.updateOne>) => {
      await hooks.beforeProjection?.();
      return collection.updateOne(...args);
    } };
  },
  getRegistrantsCollection: async () => {
    const collection = db.collection("registrants");
    return { updateOne: async (...args: Parameters<typeof collection.updateOne>) => {
      await hooks.beforeProjection?.();
      return collection.updateOne(...args);
    } };
  },
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
    hooks.beforeProjection = undefined;
    verify.mockReset();
    sendEvent.mockReset().mockResolvedValue({ ids: ["event"] });
    await db.collection("email_dispatches").deleteMany({});
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
    hooks.beforeProjection = undefined;
    verify.mockReset();
    sendEvent.mockReset().mockResolvedValue({ ids: ["event"] });
    await db.collection("email_dispatches").deleteMany({});
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

  it("attempts 11 recipients despite uncertainty and failures, including recovery", async () => {
    const rows = [];
    for (let i = 0; i < 11; i++) rows.push(await seed(`TICKET${i}`));
    const collection = db.collection<ResultEmailRecipient>("result_email_recipients");
    await collection.updateOne({ _id: rows[0]._id }, { $set: { status: "uncertain" } });
    let transientAttempts = 0;
    sendWinner.mockImplementation(async (ticket) => {
      if (ticket.ticketId === "TICKET1") return { success: false, error: "Permanent failure" };
      if (ticket.ticketId === "TICKET2" && ++transientAttempts === 1) return { success: false, error: "429" };
      return { success: true, messageId: `msg_${ticket.ticketId}` };
    });
    const { sendWinnerEmailsFunction } = await import("@/inngest/functions/send-winner-emails");
    const handler = sendWinnerEmailsFunction as unknown as (input: unknown) => Promise<unknown>;
    const step = { run: async (_name: string, callback: () => Promise<unknown>) => callback() };
    const input = { event: { data: { orgId: "org_a", date: "2026-09-14", dispatchId: drawDispatchId.toString() } }, step };
    await expect(handler(input)).rejects.toThrow("1 result emails failed or pending; 1 need provider reconciliation");
    expect(await collection.countDocuments({ status: "accepted" })).toBe(9);
    expect(sendWinner.mock.calls.filter(([ticket]) => ticket.ticketId === "TICKET2")).toHaveLength(2);
    expect(sendWinner.mock.calls.some(([ticket]) => ticket.ticketId === "TICKET0")).toBe(false);
    await collection.updateOne({ _id: rows[1]._id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60 * 1000) } });
    const { recoverWinnerEmailDispatchesFunction } = await import("@/inngest/functions/recover-winner-email-dispatches");
    const recovery = recoverWinnerEmailDispatchesFunction as unknown as () => Promise<unknown>;
    await expect(recovery()).rejects.toThrow("1 exhausted recipients");
    expect(sendEvent).toHaveBeenCalledWith(expect.objectContaining({ data: input.event.data }));
    const attemptsBeforeRecovery = sendWinner.mock.calls.length;
    await expect(handler({ event: sendEvent.mock.calls[0][0], step })).rejects.toThrow("1 need provider reconciliation");
    expect(sendWinner.mock.calls.slice(attemptsBeforeRecovery).every(([ticket]) => ticket.ticketId === "TICKET1")).toBe(true);
    expect(await collection.countDocuments({ status: "accepted" })).toBe(9);
    await db.collection("email_dispatches").insertOne({
      orgId: "org_a", date: "2026-09-14", eventName: "lottery/draw.completed", dispatchKind: "draw",
      payload: input.event.data, status: "dispatched", attempts: 1, updatedAt: new Date(),
    });
    sendEvent.mockClear();
    const { retryTodayWinnerEmails } = await import("@/lib/actions/lottery-draw.actions");
    expect(await retryTodayWinnerEmails("2026-09-14")).toMatchObject({ success: true, queued: 1 });
    const manualAttempts = sendWinner.mock.calls.length;
    await expect(handler({ event: sendEvent.mock.calls[0][0], step })).rejects.toThrow("1 need provider reconciliation");
    expect(sendWinner.mock.calls.slice(manualAttempts).every(([ticket]) => ticket.ticketId === "TICKET1")).toBe(true);
    expect(await collection.countDocuments({ status: "accepted" })).toBe(9);
  });

  it.each(["winner", "non_winner"] as const)("guards overlapping webhook projections for %s", async (kind) => {
    const row = await seed();
    const registrantId = new ObjectId();
    if (kind === "non_winner") {
      await db.collection("registrants").insertOne({ _id: registrantId, orgId: row.orgId, date: row.date });
      await db.collection("result_email_recipients").updateOne({ _id: row._id }, { $set: { kind, recipientId: registrantId.toString() } });
    }
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    hooks.beforeProjection = async () => {
      hooks.beforeProjection = undefined;
      started();
      await wait;
    };
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    const event = (type: string, created_at: string) => ({ type, created_at, data: { email_id: "msg_1", tags: { tf_recipient: row._id!.toString() } } });
    verify.mockReturnValueOnce(event("email.delivered", "2026-09-14T18:00:00Z"))
      .mockReturnValueOnce(event("email.bounced", "2026-09-14T18:01:00Z"));
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const request = () => new Request("http://localhost/api/webhooks/resend", { method: "POST", body: "{}" }) as import("next/server").NextRequest;
    const delivery = POST(request());
    await paused;
    expect((await POST(request())).status).toBe(200);
    release();
    expect((await delivery).status).toBe(200);
    const collection = db.collection(kind === "winner" ? "tickets" : "registrants");
    const current = await collection.findOne(kind === "winner" ? { ticketId: "TICKET001" } : { _id: registrantId });
    const prefix = kind === "winner" ? "email" : "nonWinnerEmail";
    expect(current?.[`${prefix}Delivery`]).toBe("bounced");
    expect(current?.[`${prefix}DeliveryRank`]).toBe(2);
    // Equal-rank failures are ordered by provider timestamp, with replay repair.
    verify.mockReturnValue(event("email.failed", "2026-09-14T18:02:00Z"));
    expect((await POST(request())).status).toBe(200);
    const { syncResultEmailRecipient } = await import("@/lib/result-email-status");
    await syncResultEmailRecipient({ ...row, kind, recipientId: kind === "winner" ? row.recipientId : registrantId.toString(),
      status: "bounced", deliveryRank: 2, deliveryAt: new Date("2026-09-14T18:01:00Z") });
    expect((await collection.findOne({ _id: current!._id }))?.[`${prefix}Delivery`]).toBe("failed");
  });

  it.each(["winner", "non_winner"] as const)("prevents a paused worker from overwriting a webhook for %s", async (kind) => {
    const row = await seed();
    if (kind === "non_winner") {
      const id = new ObjectId();
      await db.collection("registrants").insertOne({ _id: id, orgId: row.orgId, date: row.date });
      await db.collection("result_email_recipients").updateOne({ _id: row._id }, { $set: {
        kind, recipientId: id.toString(), nonWinner: { registrantId: id.toString(), email: "synthetic@example.com", date: row.date, orgName: "Org A", emailFromName: "Org A", emailFromAddress: "hello@ticketfarm.ca" },
      } });
    }
    let release!: () => void;
    let started!: () => void;
    const paused = new Promise<void>((resolve) => { started = resolve; });
    const wait = new Promise<void>((resolve) => { release = resolve; });
    hooks.beforeProjection = async () => { hooks.beforeProjection = undefined; started(); await wait; };
    sendWinner.mockResolvedValue({ success: true, messageId: "msg_1" });
    sendNonWinner.mockResolvedValue({ success: true, messageId: "msg_1" });
    const { processResultEmailBatch } = await import("@/lib/result-email-delivery");
    const worker = processResultEmailBatch(drawDispatchId.toString());
    await paused;
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
    verify.mockReturnValue({ type: "email.bounced", created_at: "2026-09-14T18:01:00Z", data: { email_id: "msg_1", tags: { tf_recipient: row._id!.toString() } } });
    const { POST } = await import("@/app/api/webhooks/resend/route");
    expect((await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body: "{}" }) as import("next/server").NextRequest)).status).toBe(200);
    release();
    await worker;
    const latest = await db.collection<ResultEmailRecipient>("result_email_recipients").findOne({ _id: row._id });
    const current = await db.collection(kind === "winner" ? "tickets" : "registrants").findOne(kind === "winner" ? { ticketId: row.recipientId } : { _id: new ObjectId(latest!.recipientId) });
    expect(current?.[kind === "winner" ? "emailDelivery" : "nonWinnerEmailDelivery"]).toBe("bounced");
  });

});
