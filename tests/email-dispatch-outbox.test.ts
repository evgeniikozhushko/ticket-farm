import { ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchesCollection = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));
const inngestSendMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getEmailDispatchesCollection: vi.fn(() => Promise.resolve(dispatchesCollection)),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: inngestSendMock },
}));

describe("email dispatch outbox", () => {
  beforeEach(() => {
    dispatchesCollection.findOneAndUpdate.mockReset();
    dispatchesCollection.updateOne.mockReset();
    inngestSendMock.mockReset();
  });

  it("atomically claims pending or failed dispatches before sending", async () => {
    const dispatchId = new ObjectId();
    dispatchesCollection.findOneAndUpdate.mockResolvedValue({
      _id: dispatchId,
      orgId: "org_1",
      date: "2026-05-28",
      eventName: "lottery/draw.completed",
      payload: { orgId: "org_1", date: "2026-05-28", tickets: [] },
    });
    inngestSendMock.mockResolvedValue(undefined);
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");

    await expect(dispatchWinnerEmailEvent({ orgId: "org_1", date: "2026-05-28" })).resolves.toBe(true);

    expect(dispatchesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org_1",
        date: "2026-05-28",
        eventName: "lottery/draw.completed",
        status: { $in: ["pending", "failed"] },
      }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "dispatching", claimToken: expect.any(String) }),
        $inc: { attempts: 1 },
      }),
      expect.objectContaining({ returnDocument: "after" })
    );
    expect(inngestSendMock).toHaveBeenCalledWith({
      id: `winner-email-dispatch:${dispatchId.toString()}`,
      name: "lottery/draw.completed",
      data: { orgId: "org_1", date: "2026-05-28", tickets: [] },
    });
    expect(dispatchesCollection.updateOne).toHaveBeenCalledWith(
      { _id: dispatchId, status: "dispatching", claimToken: expect.any(String) },
      expect.objectContaining({
        $set: expect.objectContaining({ status: "dispatched" }),
        $unset: { lastError: "", claimToken: "" },
      })
    );
  });

  it("marks a claimed dispatch failed when Inngest send fails", async () => {
    const dispatchId = new ObjectId();
    dispatchesCollection.findOneAndUpdate.mockResolvedValue({
      _id: dispatchId,
      orgId: "org_1",
      date: "2026-05-28",
      eventName: "lottery/draw.completed",
      payload: { orgId: "org_1", date: "2026-05-28", tickets: [] },
    });
    inngestSendMock.mockRejectedValue(new Error("inngest down"));
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");

    await expect(dispatchWinnerEmailEvent({ orgId: "org_1", date: "2026-05-28" })).rejects.toThrow("inngest down");

    expect(dispatchesCollection.updateOne).toHaveBeenCalledWith(
      { _id: dispatchId, status: "dispatching", claimToken: expect.any(String) },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "failed",
          lastError: "inngest down",
        }),
      })
    );
  });

  it("can claim a specific dispatch row by id", async () => {
    const dispatchId = new ObjectId();
    dispatchesCollection.findOneAndUpdate.mockResolvedValue({
      _id: dispatchId,
      orgId: "org_1",
      date: "2026-05-28",
      eventName: "lottery/draw.completed",
      payload: { orgId: "org_1", date: "2026-05-28", tickets: [] },
    });
    inngestSendMock.mockResolvedValue(undefined);
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");

    await expect(dispatchWinnerEmailEvent({ dispatchId })).resolves.toBe(true);

    expect(dispatchesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: dispatchId,
        eventName: "lottery/draw.completed",
        status: { $in: ["pending", "failed"] },
      }),
      expect.any(Object),
      expect.any(Object)
    );
  });

  it("includes stale dispatching rows only in recovery claims", async () => {
    dispatchesCollection.findOneAndUpdate.mockResolvedValue(null);
    const { dispatchWinnerEmailEvent } = await import("@/lib/email-dispatch-outbox");
    const staleBefore = new Date("2026-05-28T12:00:00Z");

    await dispatchWinnerEmailEvent({ staleBefore, maxAttempts: 10 });

    expect(dispatchesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ["pending", "failed", "dispatching"] },
        updatedAt: { $lt: staleBefore },
        attempts: { $lt: 10 },
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });
});
