import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getRegistrantsCollection,
  getResultEmailRecipientsCollection,
  getTicketsCollection,
} from "@/lib/mongodb";

export const runtime = "nodejs";

type DeliveryEvent = {
  type: "email.delivered" | "email.bounced" | "email.failed";
  created_at: string;
  data: { email_id: string; tags?: { tf_recipient?: string } };
};

const states = {
  "email.delivered": { status: "delivered", rank: 1 },
  "email.bounced": { status: "bounced", rank: 2 },
  "email.failed": { status: "delivery_failed", rank: 2 },
} as const;

export async function POST(req: NextRequest) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });

  let event: DeliveryEvent;
  try {
    const payload = await req.text();
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id") ?? "",
        timestamp: req.headers.get("svix-timestamp") ?? "",
        signature: req.headers.get("svix-signature") ?? "",
      },
      webhookSecret: secret,
    }) as DeliveryEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (!(event.type in states)) return NextResponse.json({ received: true });
  const outcome = states[event.type];
  const occurredAt = new Date(event.created_at);
  if (!event.data?.email_id || Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid delivery event" }, { status: 400 });
  }

  try {
    const recipients = await getResultEmailRecipientsCollection();
    const taggedId = event.data.tags?.tf_recipient;
    const recipient = await recipients.findOne(
      taggedId && ObjectId.isValid(taggedId)
        ? { _id: new ObjectId(taggedId) }
        : { messageId: event.data.email_id }
    );
    if (!recipient?._id) return NextResponse.json({ received: true });
    // A tagged recipient must match the actual provider message after it is
    // known; a replay for a different message cannot alter this record.
    if (recipient.messageId && recipient.messageId !== event.data.email_id) {
      return NextResponse.json({ received: true });
    }
    const updated = await recipients.findOneAndUpdate(
      {
        _id: recipient._id,
        $or: [
          { deliveryRank: { $exists: false } },
          { deliveryRank: { $lt: outcome.rank } },
          { deliveryRank: outcome.rank, deliveryAt: { $lt: occurredAt } },
        ],
      },
      {
        $set: {
          status: outcome.status,
          messageId: event.data.email_id,
          deliveryAt: occurredAt,
          deliveryRank: outcome.rank,
          acceptedAt: recipient.acceptedAt ?? occurredAt,
          updatedAt: new Date(),
        },
      },
      { returnDocument: "after" }
    );
    const current = updated ?? await recipients.findOne({ _id: recipient._id });
    if (!current) return NextResponse.json({ received: true });
    if (current.kind === "winner") {
      const tickets = await getTicketsCollection();
      await tickets.updateOne(
        { orgId: current.orgId, date: current.date, ticketId: current.recipientId },
        { $set: {
          emailSent: true,
          emailSentAt: current.acceptedAt ?? occurredAt,
          emailMessageId: current.messageId,
          emailDelivery: current.status === "delivery_failed" ? "failed" : current.status === "bounced" ? "bounced" : "delivered",
        } }
      );
    } else {
      const registrants = await getRegistrantsCollection();
      await registrants.updateOne(
        { orgId: current.orgId, date: current.date, _id: new ObjectId(current.recipientId) },
        { $set: {
          nonWinnerEmailSent: true,
          nonWinnerEmailSentAt: current.acceptedAt ?? occurredAt,
          nonWinnerEmailMessageId: current.messageId,
          nonWinnerEmailDelivery: current.status === "delivery_failed" ? "failed" : current.status === "bounced" ? "bounced" : "delivered",
        } }
      );
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[resend-webhook] Delivery update failed:", error);
    return NextResponse.json({ error: "Delivery update failed" }, { status: 500 });
  }
}
