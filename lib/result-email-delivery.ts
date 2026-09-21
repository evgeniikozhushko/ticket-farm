import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { sendNonWinnerEmail, sendWinnerEmail } from "@/lib/email";
import {
  getRegistrantsCollection,
  getResultEmailRecipientsCollection,
  getTicketsCollection,
} from "@/lib/mongodb";
import type { ResultEmailRecipient } from "@/lib/types";

const BATCH_SIZE = 5;
const LEASE_MS = 5 * 60 * 1000;
const IDEMPOTENCY_MS = 23 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;

async function syncRecipient(record: ResultEmailRecipient) {
  if (record.status !== "accepted" && record.status !== "delivered" &&
      record.status !== "bounced" && record.status !== "delivery_failed" && record.status !== "failed") return;
  const success = record.status !== "failed";
  const set = success
    ? {
        emailSent: true,
        emailSentAt: record.acceptedAt ?? new Date(),
        ...(record.messageId ? { emailMessageId: record.messageId } : {}),
      }
    : { emailSent: false, emailError: record.lastError ?? "Email send failed." };
  if (record.kind === "winner") {
    const tickets = await getTicketsCollection();
    await tickets.updateOne(
      { orgId: record.orgId, date: record.date, ticketId: record.recipientId,
        ...(success ? {} : { emailSent: { $ne: true } }) },
      success ? { $set: set, $unset: { emailError: "" } } : { $set: set }
    );
  } else {
    const registrants = await getRegistrantsCollection();
    const nonWinnerSet = success
      ? {
          nonWinnerEmailSent: true,
          nonWinnerEmailSentAt: record.acceptedAt ?? new Date(),
          ...(record.messageId ? { nonWinnerEmailMessageId: record.messageId } : {}),
        }
      : { nonWinnerEmailSent: false, nonWinnerEmailError: record.lastError ?? "Email send failed." };
    await registrants.updateOne(
      { orgId: record.orgId, date: record.date, _id: new ObjectId(record.recipientId),
        ...(success ? {} : { nonWinnerEmailSent: { $ne: true } }) },
      success ? { $set: nonWinnerSet, $unset: { nonWinnerEmailError: "" } } : { $set: nonWinnerSet }
    );
  }
}

export async function processResultEmailBatch(drawDispatchId: string, afterId?: string) {
  const recipients = await getResultEmailRecipientsCollection();
  const rows = await recipients.find({
    drawDispatchId: new ObjectId(drawDispatchId),
    ...(afterId ? { _id: { $gt: new ObjectId(afterId) } } : {}),
  }).sort({ _id: 1 }).limit(BATCH_SIZE).toArray();
  const counts = { sent: 0, failed: 0, skipped: 0, uncertain: 0 };

  for (const row of rows) {
    if (!row._id) throw new Error("Email recipient is missing its ID.");
    if (["accepted", "delivered", "bounced", "delivery_failed"].includes(row.status)) {
      await syncRecipient(row);
      counts.skipped++;
      continue;
    }
    const now = new Date();
    if (row.status === "uncertain") {
      counts.uncertain++;
      continue;
    }
    if (row.attempts >= MAX_ATTEMPTS) {
      await recipients.updateOne(
        { _id: row._id, status: row.status, attempts: { $gte: MAX_ATTEMPTS } },
        { $set: { status: "uncertain", updatedAt: now, lastError: "Email attempts exhausted; reconcile with Resend." },
          $unset: { claimToken: "" } }
      );
      counts.uncertain++;
      continue;
    }
    if (row.firstAttemptAt && row.firstAttemptAt.getTime() <= now.getTime() - IDEMPOTENCY_MS) {
      await recipients.updateOne(
        { _id: row._id, status: row.status, ...(row.claimToken ? { claimToken: row.claimToken } : {}) },
        { $set: { status: "uncertain", updatedAt: now, lastError: "Provider outcome unknown after idempotency window." },
          $unset: { claimToken: "" } }
      );
      counts.uncertain++;
      continue;
    }
    if ((row.status === "sending" || row.status === "failed") && row.claimedAt) {
      if (row.status === "sending" && row.claimedAt.getTime() > now.getTime() - LEASE_MS) {
        counts.skipped++;
        continue;
      }
      if (row.claimedAt.getTime() <= now.getTime() - IDEMPOTENCY_MS) {
        await recipients.updateOne(
          { _id: row._id, status: row.status, ...(row.claimToken ? { claimToken: row.claimToken } : {}) },
          { $set: { status: "uncertain", updatedAt: now, lastError: "Provider outcome unknown after idempotency window." },
            $unset: { claimToken: "" } }
        );
        counts.uncertain++;
        continue;
      }
    }
    const claimToken = randomUUID();
    const claimed = await recipients.findOneAndUpdate(
      {
        _id: row._id,
        $or: [
          { status: { $in: ["pending", "failed"] } },
          { status: "sending", claimedAt: { $lt: new Date(now.getTime() - LEASE_MS) } },
        ],
      },
      [{ $set: {
        status: "sending",
        claimToken,
        claimedAt: now,
        firstAttemptAt: { $ifNull: ["$firstAttemptAt", now] },
        updatedAt: now,
        attempts: { $add: [{ $ifNull: ["$attempts", 0] }, 1] },
      } }],
      { returnDocument: "after" }
    );
    if (!claimed) {
      counts.skipped++;
      continue;
    }
    const result = claimed.kind === "winner"
      ? await sendWinnerEmail(claimed.ticket!)
      : await sendNonWinnerEmail(claimed.nonWinner!);
    if (result.success && !result.messageId) {
      await recipients.updateOne(
        { _id: row._id, status: "sending", claimToken },
        { $set: { status: "uncertain", acceptedAt: new Date(), updatedAt: new Date(),
            lastError: "Resend accepted the email without a message ID; reconcile before retrying." },
          $unset: { claimToken: "" } }
      );
      counts.uncertain++;
      continue;
    }
    const status = result.success ? "accepted" : "failed";
    await recipients.updateOne(
      { _id: row._id, status: "sending", claimToken },
      result.success
        ? { $set: { status, messageId: result.messageId, acceptedAt: new Date(), updatedAt: new Date() },
            $unset: { claimToken: "", lastError: "" } }
        : { $set: { status, lastError: result.error ?? "Email send failed.", updatedAt: new Date() },
            $unset: { claimToken: "" } }
    );
    const latest = await recipients.findOne({ _id: row._id });
    if (latest) await syncRecipient(latest);
    if (result.success) counts.sent++;
    else counts.failed++;
  }
  return {
    ...counts,
    lastId: rows.at(-1)?._id?.toString(),
    done: rows.length < BATCH_SIZE,
  };
}
