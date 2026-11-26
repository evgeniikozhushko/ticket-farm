import { ObjectId } from "mongodb";
import { getRegistrantsCollection, getTicketsCollection } from "@/lib/mongodb";
import type { ResultEmailRecipient } from "@/lib/types";

export async function syncResultEmailRecipient(record: ResultEmailRecipient) {
  if (record.status !== "accepted" && record.status !== "delivered" &&
      record.status !== "bounced" && record.status !== "delivery_failed" && record.status !== "failed") return;
  const success = record.status !== "failed";
  const delivery: "delivered" | "bounced" | "failed" | undefined = record.status === "delivered"
    ? "delivered"
    : record.status === "bounced"
      ? "bounced"
      : record.status === "delivery_failed"
        ? "failed"
        : undefined;
  const acceptedAt = record.acceptedAt ?? record.createdAt;
  const attemptAt = record.firstAttemptAt ?? acceptedAt;
  const set = success
    ? {
        emailSent: true,
        emailSentAt: acceptedAt,
        ...(record.messageId ? { emailMessageId: record.messageId } : {}),
        ...(delivery ? { emailDelivery: delivery } : {}),
      }
    : { emailSent: false, emailError: record.lastError ?? "Email send failed." };
  const prefix = record.kind === "winner" ? "email" : "nonWinnerEmail";
  const rank = record.deliveryRank ?? (delivery === "delivered" ? 1 : delivery ? 2 : 0);
  const deliveryAt = record.deliveryAt ?? record.acceptedAt ?? new Date(0);
  // Also respect terminal outcomes written before ordering metadata existed.
  const storedRank = { $ifNull: [`$${prefix}DeliveryRank`, {
    $switch: {
      branches: [
        { case: { $in: [`$${prefix}Delivery`, ["bounced", "failed"]] }, then: 2 },
        { case: { $eq: [`$${prefix}Delivery`, "delivered"] }, then: 1 },
      ],
      default: 0,
    },
  }] };
  const sameMessageOrder = { $or: [
    { $lt: [storedRank, rank] },
    { $and: [
      { $eq: [storedRank, rank] },
      { $lte: [{ $ifNull: [`$${prefix}DeliveryAt`, new Date(0)] }, deliveryAt] },
    ] },
  ] };
  const storedId = { $ifNull: [`$${prefix}MessageId`, null] };
  const storedAttempt = { $ifNull: [`$${prefix}AttemptAt`, `$${prefix}SentAt`] };
  // Rank events within one message. A replacement send must have started later.
  const ordering = success ? { $expr: { $cond: [
    { $and: [record.messageId != null, { $ne: [storedId, null] }, { $ne: [storedId, record.messageId ?? null] }] },
    { $lt: [{ $ifNull: [storedAttempt, new Date(0)] }, attemptAt] },
    { $and: [{ $or: [record.messageId != null, { $eq: [storedId, null] }] }, sameMessageOrder] },
  ] } } : {};
  const unset: Record<string, ""> = { [`${prefix}Error`]: "", ...(!delivery ? { [`${prefix}Delivery`]: "" } : {}) };
  const metadata = success ? {
    [`${prefix}AttemptAt`]: attemptAt,
    [`${prefix}DeliveryRank`]: rank,
    [`${prefix}DeliveryAt`]: deliveryAt,
  } : {};
  if (record.kind === "winner") {
    const tickets = await getTicketsCollection();
    await tickets.updateOne(
      { orgId: record.orgId, date: record.date, ticketId: record.recipientId,
        ...ordering, ...(success ? {} : { emailSent: { $ne: true } }) },
      success ? { $set: { ...set, ...metadata }, $unset: unset } : { $set: set }
    );
  } else {
    const registrants = await getRegistrantsCollection();
    const nonWinnerSet = success
      ? {
          nonWinnerEmailSent: true,
          nonWinnerEmailSentAt: acceptedAt,
          ...(record.messageId ? { nonWinnerEmailMessageId: record.messageId } : {}),
          ...(delivery ? { nonWinnerEmailDelivery: delivery } : {}),
        }
      : { nonWinnerEmailSent: false, nonWinnerEmailError: record.lastError ?? "Email send failed." };
    await registrants.updateOne(
      { orgId: record.orgId, date: record.date, _id: new ObjectId(record.recipientId),
        ...ordering, ...(success ? {} : { nonWinnerEmailSent: { $ne: true } }) },
      success ? { $set: { ...nonWinnerSet, ...metadata }, $unset: unset } : { $set: nonWinnerSet }
    );
  }
}

