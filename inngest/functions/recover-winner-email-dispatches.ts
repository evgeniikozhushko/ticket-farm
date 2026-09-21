import { inngest } from "@/inngest/client";
import { dispatchWinnerEmailEvent } from "@/lib/email-dispatch-outbox";
import { getEmailDispatchesCollection, getResultEmailRecipientsCollection } from "@/lib/mongodb";

const RECOVERY_BATCH_SIZE = 25;
const STALE_AFTER_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 10;

export const recoverWinnerEmailDispatchesFunction = inngest.createFunction(
  { id: "recover-winner-email-dispatches", retries: 0 },
  { cron: "*/15 * * * *" },
  async () => {
    const staleBefore = new Date(Date.now() - STALE_AFTER_MS);
    const dispatchesCollection = await getEmailDispatchesCollection();
    await dispatchesCollection.updateMany(
      {
        eventName: "lottery/draw.completed",
        status: "dispatching",
        updatedAt: { $lt: staleBefore },
        attempts: { $gte: MAX_ATTEMPTS },
      },
      {
        $set: {
          status: "failed",
          lastError: "Dispatch attempts exhausted after an interrupted claim.",
          updatedAt: new Date(),
        },
        $unset: { claimToken: "" },
      },
    );
    let dispatched = 0;
    let failed = 0;

    for (let i = 0; i < RECOVERY_BATCH_SIZE; i++) {
      try {
        const claimed = await dispatchWinnerEmailEvent({
          staleBefore,
          maxAttempts: MAX_ATTEMPTS,
        });

        if (!claimed) break;
        dispatched++;
      } catch (err) {
        failed++;
        console.error("[recoverWinnerEmailDispatches] Dispatch failed:", err);
      }
    }

    const exhausted = await dispatchesCollection.countDocuments({
      eventName: "lottery/draw.completed",
      status: "failed",
      attempts: { $gte: MAX_ATTEMPTS },
    });
    const recipientsCollection = await getResultEmailRecipientsCollection();
    const staleRecipients = await recipientsCollection.aggregate<{
      _id: import("mongodb").ObjectId;
      orgId: string;
      date: string;
    }>([
      {
        $match: {
          status: { $in: ["pending", "failed", "sending"] },
          updatedAt: { $lt: staleBefore },
          attempts: { $lt: MAX_ATTEMPTS },
        },
      },
      { $group: { _id: "$drawDispatchId", orgId: { $first: "$orgId" }, date: { $first: "$date" } } },
      { $limit: RECOVERY_BATCH_SIZE },
    ]).toArray();
    for (const draw of staleRecipients) {
      try {
        await inngest.send({
          id: `result-email-recovery:${draw._id}:${Math.floor(Date.now() / (15 * 60 * 1000))}`,
          name: "lottery/draw.completed",
          data: { orgId: draw.orgId, date: draw.date, dispatchId: draw._id.toString() },
        });
        dispatched++;
      } catch (err) {
        failed++;
        console.error("[recoverWinnerEmailDispatches] Result email recovery failed:", err);
      }
    }
    const exhaustedRecipients = await recipientsCollection.countDocuments({
      $or: [
        { status: "uncertain" },
        { status: { $in: ["failed", "sending"] }, attempts: { $gte: MAX_ATTEMPTS } },
      ],
    });
    if (failed > 0 || exhausted > 0 || exhaustedRecipients > 0) {
      throw new Error(`Winner email recovery: ${failed} dispatch failures; ${exhausted} exhausted dispatches; ${exhaustedRecipients} exhausted recipients.`);
    }

    return { dispatched, failed, exhausted, exhaustedRecipients };
  }
);
