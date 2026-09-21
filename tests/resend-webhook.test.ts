import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const verify = vi.hoisted(() => vi.fn());
const recipients = vi.hoisted(() => ({ findOne: vi.fn(), findOneAndUpdate: vi.fn() }));
const tickets = vi.hoisted(() => ({ updateOne: vi.fn() }));
const registrants = vi.hoisted(() => ({ updateOne: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { webhooks = { verify }; } }));
vi.mock("@/lib/mongodb", () => ({
  getResultEmailRecipientsCollection: async () => recipients,
  getTicketsCollection: async () => tickets,
  getRegistrantsCollection: async () => registrants,
}));

const recipientId = new ObjectId();
const winner = {
  _id: recipientId, orgId: "org_a", date: "2026-09-14", kind: "winner",
  recipientId: "TICKET001", status: "sending",
};

function request() {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "svix-id": "event_1", "svix-timestamp": "123", "svix-signature": "signature" },
    body: "{}",
  }) as NextRequest;
}

beforeEach(() => {
  process.env.RESEND_WEBHOOK_SECRET = "whsec_test";
  verify.mockReset();
  recipients.findOne.mockReset().mockResolvedValue(winner);
  recipients.findOneAndUpdate.mockReset();
  tickets.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  registrants.updateOne.mockReset();
});

it("rejects an unverified event before database access", async () => {
  verify.mockImplementation(() => { throw new Error("bad signature"); });
  const { POST } = await import("@/app/api/webhooks/resend/route");
  expect((await POST(request())).status).toBe(400);
  expect(recipients.findOne).not.toHaveBeenCalled();
});

it("records a delivered event using its recipient tag before acceptance is stored", async () => {
  verify.mockReturnValue({
    type: "email.delivered", created_at: "2026-09-14T18:00:00Z",
    data: { email_id: "msg_1", tags: { tf_recipient: recipientId.toString() } },
  });
  recipients.findOneAndUpdate.mockResolvedValue({
    ...winner, status: "delivered", messageId: "msg_1",
    acceptedAt: new Date("2026-09-14T18:00:00Z"),
  });
  const { POST } = await import("@/app/api/webhooks/resend/route");
  expect((await POST(request())).status).toBe(200);
  expect(recipients.findOne).toHaveBeenCalledWith({ _id: recipientId });
  expect(recipients.findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ _id: recipientId, $or: expect.any(Array) }),
    expect.objectContaining({ $set: expect.objectContaining({ status: "delivered", messageId: "msg_1" }) }),
    { returnDocument: "after" }
  );
  expect(tickets.updateOne).toHaveBeenCalledWith(
    { orgId: "org_a", date: "2026-09-14", ticketId: "TICKET001" },
    { $set: expect.objectContaining({ emailSent: true, emailMessageId: "msg_1", emailDelivery: "delivered" }) }
  );
});

it("does not overwrite a newer bounce with an older delivery replay", async () => {
  verify.mockReturnValue({
    type: "email.delivered", created_at: "2026-09-14T18:00:00Z",
    data: { email_id: "msg_1", tags: { tf_recipient: recipientId.toString() } },
  });
  recipients.findOne.mockResolvedValue({ ...winner, status: "bounced", messageId: "msg_1" });
  recipients.findOneAndUpdate.mockResolvedValue(null);
  const { POST } = await import("@/app/api/webhooks/resend/route");
  expect((await POST(request())).status).toBe(200);
  expect(tickets.updateOne).toHaveBeenCalledWith(
    expect.anything(),
    { $set: expect.objectContaining({ emailDelivery: "bounced" }) }
  );
});

it("asks Resend to retry when a delivery-state write fails", async () => {
  verify.mockReturnValue({
    type: "email.bounced", created_at: "2026-09-14T18:01:00Z",
    data: { email_id: "msg_1", tags: { tf_recipient: recipientId.toString() } },
  });
  recipients.findOneAndUpdate.mockRejectedValue(new Error("MongoDB unavailable"));
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { POST } = await import("@/app/api/webhooks/resend/route");
    expect((await POST(request())).status).toBe(500);
    expect(tickets.updateOne).not.toHaveBeenCalled();
  } finally {
    errorSpy.mockRestore();
  }
});

it("records a non-winner bounce on the matching registrant", async () => {
  const registrantId = new ObjectId();
  verify.mockReturnValue({
    type: "email.bounced", created_at: "2026-09-14T18:02:00Z",
    data: { email_id: "msg_nw", tags: { tf_recipient: recipientId.toString() } },
  });
  recipients.findOne.mockResolvedValue({ ...winner, kind: "non_winner", recipientId: registrantId.toString() });
  recipients.findOneAndUpdate.mockResolvedValue({
    ...winner, kind: "non_winner", recipientId: registrantId.toString(),
    status: "bounced", messageId: "msg_nw",
  });
  const { POST } = await import("@/app/api/webhooks/resend/route");
  expect((await POST(request())).status).toBe(200);
  expect(registrants.updateOne).toHaveBeenCalledWith(
    { orgId: "org_a", date: "2026-09-14", _id: registrantId },
    { $set: expect.objectContaining({ nonWinnerEmailDelivery: "bounced", nonWinnerEmailMessageId: "msg_nw" }) }
  );
});

it("replays a verified event to repair a failed ticket status write", async () => {
  verify.mockReturnValue({
    type: "email.delivered", created_at: "2026-09-14T18:00:00Z",
    data: { email_id: "msg_1", tags: { tf_recipient: recipientId.toString() } },
  });
  const delivered = { ...winner, status: "delivered", messageId: "msg_1" };
  recipients.findOne.mockResolvedValueOnce(winner).mockResolvedValueOnce(delivered).mockResolvedValue(delivered);
  recipients.findOneAndUpdate.mockResolvedValueOnce(delivered).mockResolvedValue(null);
  tickets.updateOne.mockRejectedValueOnce(new Error("MongoDB unavailable")).mockResolvedValue({ modifiedCount: 1 });
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const { POST } = await import("@/app/api/webhooks/resend/route");
    expect((await POST(request())).status).toBe(500);
    expect((await POST(request())).status).toBe(200);
    expect(tickets.updateOne).toHaveBeenCalledTimes(2);
  } finally {
    errorSpy.mockRestore();
  }
});
