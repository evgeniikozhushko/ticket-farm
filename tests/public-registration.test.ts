import { MongoError, ObjectId } from "mongodb";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lotteries: {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn(),
  },
  registrants: {
    findOne: vi.fn(),
    insertOne: vi.fn(),
    countDocuments: vi.fn(),
  },
  limits: { findOneAndUpdate: vi.fn(), updateOne: vi.fn() },
  getLimits: vi.fn(),
  org: vi.fn(),
  headers: vi.fn(),
  transaction: vi.fn(),
}));
const session = { withTransaction: mocks.transaction };
vi.mock("@/lib/mongodb", () => ({
  getLotteriesCollection: async () => mocks.lotteries,
  getRegistrantsCollection: async () => mocks.registrants,
  getPublicRegistrationRateLimitsCollection: mocks.getLimits,
  getClient: async () => ({
    withSession: async (callback: (value: typeof session) => unknown) =>
      callback(session),
  }),
}));
vi.mock("@/lib/org-cache", () => ({ getOrgBySlug: mocks.org }));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-05-28" }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
import { enterLottery } from "@/lib/actions/lottery.actions";

const scope = { orgId: "org_1", date: "2026-05-28" };
function form() {
  const data = new FormData();
  data.set("name", "Person");
  data.set("email", "person@example.com");
  data.set("consent", "true");
  return data;
}
const enter = () => enterLottery("farm", form());
const failed = (error: string) => ({ success: false, error });
const generic = "Something went wrong on our side. Please try again.";

describe("public registration", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.org.mockResolvedValue({
      clerkOrgId: "org_1",
      timezone: "America/Edmonton",
      maxRegistrantsPerDay: 100,
    });
    mocks.headers.mockResolvedValue(
      new Headers({ "x-forwarded-for": "203.0.113.10" }),
    );
    mocks.getLimits.mockResolvedValue(mocks.limits);
    mocks.limits.findOneAndUpdate.mockResolvedValue({ count: 1 });
    mocks.limits.updateOne.mockResolvedValue({ modifiedCount: 1 });
    mocks.lotteries.findOne.mockResolvedValue({
      ...scope,
      status: "OPEN",
      registrantCount: 0,
    });
    mocks.lotteries.findOneAndUpdate.mockResolvedValue({
      ...scope,
      registrantCount: 1,
    });
    mocks.lotteries.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.registrants.findOne.mockResolvedValue(null);
    mocks.registrants.countDocuments.mockResolvedValue(7);
    mocks.registrants.insertOne.mockResolvedValue({ acknowledged: true });
    mocks.transaction.mockImplementation(async (callback) => callback());
  });

  it("checks duplicates before headers, quota, or rate limits", async () => {
    mocks.registrants.findOne.mockResolvedValue({ ...scope });
    expect(await enter()).toEqual(
      failed(
        "You've already entered today's lottery. Please check back tomorrow.",
      ),
    );
    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.lotteries.updateOne).not.toHaveBeenCalled();
    expect(mocks.getLimits).not.toHaveBeenCalled();
  });

  it("consumes limits before initialization and inserts with the quota session", async () => {
    expect(await enter()).toEqual({ success: true });
    expect(mocks.lotteries.updateOne).toHaveBeenCalledWith(
      scope,
      {
        $setOnInsert: {
          ...scope,
          status: "OPEN",
          registrantCount: 0,
          dailyTheme: "",
          maxTicketsAvailable: 0,
        },
      },
      { upsert: true },
    );
    expect(mocks.lotteries.findOneAndUpdate).toHaveBeenCalledWith(
      { ...scope, status: "OPEN", registrantCount: { $lt: 100 } },
      { $inc: { registrantCount: 1 } },
      { session, returnDocument: "after" },
    );
    expect(mocks.registrants.insertOne).toHaveBeenCalledWith(
      {
        ...scope,
        _id: expect.any(ObjectId),
        name: "Person",
        email: "person@example.com",
        enteredAt: expect.any(Date),
      },
      { session },
    );
    expect(
      mocks.limits.findOneAndUpdate.mock.invocationCallOrder[1],
    ).toBeLessThan(mocks.lotteries.updateOne.mock.invocationCallOrder[0]);
    expect(mocks.limits.updateOne).not.toHaveBeenCalled();
  });

  it.each([null, undefined, Infinity])(
    "omits the capacity condition for unlimited %s",
    async (limit) => {
      mocks.org.mockResolvedValue({
        clerkOrgId: "org_1",
        maxRegistrantsPerDay: limit,
      });
      expect(await enter()).toEqual({ success: true });
      expect(mocks.lotteries.findOneAndUpdate.mock.calls[0][0]).toEqual({
        ...scope,
        status: "OPEN",
      });
    },
  );

  it("initializes a missing counter from scoped registrations inside the transaction", async () => {
    mocks.lotteries.findOne.mockResolvedValue({ ...scope, status: "OPEN" });
    expect(await enter()).toEqual({ success: true });
    expect(mocks.registrants.countDocuments).toHaveBeenCalledWith(scope, {
      session,
    });
    expect(mocks.lotteries.updateOne).toHaveBeenLastCalledWith(
      { ...scope, status: "OPEN", registrantCount: { $exists: false } },
      { $set: { registrantCount: 7 } },
      { session },
    );
  });

  it.each([0, 100])("returns full for cap %s and refunds once", async (cap) => {
    mocks.org.mockResolvedValue({
      clerkOrgId: "org_1",
      maxRegistrantsPerDay: cap,
    });
    mocks.lotteries.findOne.mockResolvedValue({
      ...scope,
      status: "OPEN",
      registrantCount: cap,
    });
    mocks.lotteries.findOneAndUpdate.mockResolvedValue(null);
    expect(await enter()).toEqual(
      failed("Registration is full for today. Check back tomorrow."),
    );
    expect(mocks.registrants.insertOne).not.toHaveBeenCalled();
    expect(mocks.limits.updateOne).toHaveBeenCalledTimes(2);
  });

  it.each(["CLOSED", "LOTTERY_DRAWN"])(
    "truthfully rejects %s without claiming quota",
    async (status) => {
      mocks.lotteries.findOne.mockResolvedValue({
        ...scope,
        status,
        registrantCount: 0,
      });
      expect(await enter()).toEqual(
        failed("Registration is closed for today. Check back tomorrow."),
      );
      expect(mocks.lotteries.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mocks.limits.updateOne).toHaveBeenCalledTimes(2);
    },
  );

  it.each([
    null,
    { status: "INVALID", registrantCount: 0 },
    { status: "OPEN", registrantCount: -1 },
    { status: "OPEN", registrantCount: null },
  ])("rejects missing/inconsistent lotteries: %s", async (lottery) => {
    mocks.lotteries.findOne.mockResolvedValue(lottery);
    expect(await enter()).toEqual(
      failed("Registration is currently unavailable. Please try again later."),
    );
    expect(mocks.registrants.insertOne).not.toHaveBeenCalled();
  });

  it.each(["CLOSED", "LOTTERY_DRAWN", "OPEN", null])(
    "classifies a failed claim against current status %s",
    async (status) => {
      mocks.lotteries.findOne
        .mockResolvedValueOnce({ status: "OPEN", registrantCount: 0 })
        .mockResolvedValue(status && { status, registrantCount: 0 });
      mocks.lotteries.findOneAndUpdate.mockResolvedValue(null);
      expect(await enter()).toEqual(
        failed(
          status && status !== "OPEN"
            ? "Registration is closed for today. Check back tomorrow."
            : "Registration is currently unavailable. Please try again later.",
        ),
      );
    },
  );

  it("does not consume anything when headers fail", async () => {
    mocks.headers.mockRejectedValue(new Error("headers failed"));
    expect(await enter()).toEqual(failed(generic));
    expect(mocks.getLimits).not.toHaveBeenCalled();
    expect(mocks.lotteries.updateOne).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "refunds the successful limiter when the other denies/throws (%s)",
    async (throws) => {
      if (throws)
        mocks.limits.findOneAndUpdate.mockRejectedValueOnce(
          new Error("limiter failed"),
        );
      else mocks.limits.findOneAndUpdate.mockResolvedValueOnce(null);
      expect(await enter()).toEqual(
        failed(
          throws
            ? generic
            : "Too many registration attempts. Please try again later.",
        ),
      );
      expect(mocks.limits.updateOne).toHaveBeenCalledTimes(1);
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "refund failures cannot replace the admission response (%s)",
    async (acquisition) => {
      mocks.lotteries.findOne.mockResolvedValue({ status: "CLOSED" });
      if (acquisition)
        mocks.getLimits
          .mockResolvedValueOnce(mocks.limits)
          .mockResolvedValueOnce(mocks.limits)
          .mockRejectedValue(new Error("collection failed"));
      else mocks.limits.updateOne.mockRejectedValue(new Error("refund failed"));
      expect(await enter()).toEqual(
        failed("Registration is closed for today. Check back tomorrow."),
      );
    },
  );

  it.each([false, true])(
    "refunds aborted insert failures without quota compensation (%s)",
    async (duplicate) => {
      mocks.registrants.insertOne.mockRejectedValue(
        duplicate ? { code: 11000 } : new Error("insert failed"),
      );
      expect(await enter()).toEqual(
        failed(
          duplicate
            ? "You've already entered today's lottery. Please check back tomorrow."
            : generic,
        ),
      );
      expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(1); // Initialization only.
      expect(mocks.limits.updateOne).toHaveBeenCalledTimes(2);
    },
  );

  it("bounds initialization duplicate-race retries", async () => {
    mocks.lotteries.updateOne.mockRejectedValue({ code: 11000 });
    expect(await enter()).toEqual(failed(generic));
    expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(5);
    expect(mocks.limits.updateOne).toHaveBeenCalledTimes(2);
  });

  it("retries initialization without resetting an existing lottery", async () => {
    mocks.lotteries.updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await enter()).toEqual({ success: true });
    expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "retains identity across transaction retries and refunds only after final failure (%s)",
    async (fails) => {
      const transient = new MongoError("retry");
      transient.addErrorLabel("TransientTransactionError");
      mocks.registrants.insertOne.mockRejectedValueOnce(transient);
      mocks.transaction.mockImplementation(async (callback) => {
        await expect(callback()).rejects.toBe(transient);
        expect(mocks.limits.updateOne).not.toHaveBeenCalled();
        if (fails)
          mocks.registrants.insertOne.mockRejectedValue(
            new Error("failed again"),
          );
        return callback();
      });
      expect(await enter()).toEqual(
        fails ? failed(generic) : { success: true },
      );
      expect(mocks.registrants.insertOne.mock.calls[0][0]._id).toEqual(
        mocks.registrants.insertOne.mock.calls[1][0]._id,
      );
      expect(mocks.limits.updateOne).toHaveBeenCalledTimes(fails ? 2 : 0);
    },
  );

  it.each(["confirmed", "absent", "read fails"])(
    "handles an uncertain commit: %s",
    async (outcome) => {
      const unknown = new MongoError("uncertain");
      unknown.addErrorLabel("UnknownTransactionCommitResult");
      mocks.transaction.mockImplementation(async (callback) => {
        await callback();
        throw unknown;
      });
      mocks.registrants.findOne.mockResolvedValueOnce(null);
      if (outcome === "read fails")
        mocks.registrants.findOne.mockRejectedValue(new Error("read failed"));
      else
        mocks.registrants.findOne.mockResolvedValue(
          outcome === "confirmed" ? { _id: new ObjectId() } : null,
        );
      expect(await enter()).toEqual(
        outcome === "confirmed"
          ? { success: true }
          : failed("Unable to confirm registration. Please try again later."),
      );
      expect(mocks.registrants.findOne).toHaveBeenLastCalledWith(
        { _id: mocks.registrants.insertOne.mock.calls[0][0]._id, ...scope },
        { readPreference: "primary", readConcern: { level: "majority" } },
      );
      expect(mocks.limits.updateOne).not.toHaveBeenCalled();
      expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(1);
    },
  );
});
