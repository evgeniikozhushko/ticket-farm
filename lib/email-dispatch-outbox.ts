import { getEmailDispatchesCollection } from "@/lib/mongodb";
import { inngest } from "@/inngest/client";
import { ObjectId } from "mongodb";

const DISPATCHABLE_STATUSES = ["pending", "failed"] as const;

type DispatchWinnerEmailEventInput = {
  dispatchId?: ObjectId | string;
  orgId?: string;
  date?: string;
  staleBefore?: Date;
  maxAttempts?: number;
};

export async function dispatchWinnerEmailEvent(
  input: DispatchWinnerEmailEventInput = {}
): Promise<boolean> {
  const dispatchesCollection = await getEmailDispatchesCollection();
  const now = new Date();
  const dispatchId =
    typeof input.dispatchId === "string" ? new ObjectId(input.dispatchId) : input.dispatchId;

  const dispatch = await dispatchesCollection.findOneAndUpdate(
    {
      ...(dispatchId ? { _id: dispatchId } : {}),
      eventName: "lottery/draw.completed",
      status: { $in: DISPATCHABLE_STATUSES },
      ...(input.orgId ? { orgId: input.orgId } : {}),
      ...(input.date ? { date: input.date } : {}),
      ...(input.staleBefore ? { updatedAt: { $lt: input.staleBefore } } : {}),
      ...(input.maxAttempts === undefined ? {} : { attempts: { $lt: input.maxAttempts } }),
    },
    {
      $set: {
        status: "dispatching",
        updatedAt: now,
      },
      $inc: { attempts: 1 },
    },
    {
      sort: { updatedAt: 1 },
      returnDocument: "after",
    }
  );

  if (!dispatch) return false;

  try {
    await inngest.send({
      id: `winner-email-dispatch:${dispatch._id?.toString() ?? `${dispatch.orgId}:${dispatch.date}`}`,
      name: dispatch.eventName,
      data: dispatch.payload,
    });

    await dispatchesCollection.updateOne(
      { _id: dispatch._id },
      {
        $set: {
          status: "dispatched",
          dispatchedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: { lastError: "" },
      }
    );

    return true;
  } catch (err) {
    await dispatchesCollection.updateOne(
      { _id: dispatch._id },
      {
        $set: {
          status: "failed",
          lastError: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        },
      }
    );
    throw err;
  }
}
