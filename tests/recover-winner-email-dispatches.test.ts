import { beforeEach, describe, expect, it, vi } from "vitest";

const dispatchMock = vi.hoisted(() => vi.fn());
const collection = vi.hoisted(() => ({ updateMany: vi.fn(), countDocuments: vi.fn() }));
const recoveryHandler = vi.hoisted(() => ({ run: async (): Promise<unknown> => undefined }));

vi.mock("@/lib/email-dispatch-outbox", () => ({ dispatchWinnerEmailEvent: dispatchMock }));
vi.mock("@/lib/mongodb", () => ({ getEmailDispatchesCollection: async () => collection }));
vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: (_options: unknown, _trigger: unknown, handler: () => Promise<unknown>) => {
    recoveryHandler.run = handler;
    return handler;
  } },
}));

describe("winner email recovery cron", () => {
  beforeEach(() => {
    dispatchMock.mockReset();
    collection.updateMany.mockReset().mockResolvedValue({ modifiedCount: 0 });
    collection.countDocuments.mockReset().mockResolvedValue(0);
  });

  it("processes other rows after one dispatch fails and marks the run failed", async () => {
    dispatchMock.mockRejectedValueOnce(new Error("Inngest unavailable"))
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await import("@/inngest/functions/recover-winner-email-dispatches");
      await expect(recoveryHandler.run()).rejects.toThrow("1 dispatch failures");
      expect(dispatchMock).toHaveBeenCalledTimes(3);
      expect(errorSpy).toHaveBeenCalledOnce();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("releases stale exhausted claims and surfaces exhausted rows", async () => {
    dispatchMock.mockResolvedValue(false);
    collection.countDocuments.mockResolvedValue(1);
    await import("@/inngest/functions/recover-winner-email-dispatches");

    await expect(recoveryHandler.run()).rejects.toThrow("1 exhausted dispatches");
    expect(collection.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ status: "dispatching", attempts: { $gte: 10 } }),
      expect.objectContaining({
        $set: expect.objectContaining({ status: "failed" }),
        $unset: { claimToken: "" },
      }),
    );
  });

  it("stops after the 25-row recovery batch", async () => {
    dispatchMock.mockResolvedValue(true);
    await import("@/inngest/functions/recover-winner-email-dispatches");

    await expect(recoveryHandler.run()).resolves.toEqual({ dispatched: 25, failed: 0, exhausted: 0 });
    expect(dispatchMock).toHaveBeenCalledTimes(25);
  });
});
