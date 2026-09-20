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
  verify: vi.fn(),
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
vi.mock("@/lib/orgs", () => ({ getOrgBySlug: mocks.org }));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-05-28" }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/turnstile", () => ({ verifyRegistrationChallenge: mocks.verify }));
import { enterLottery } from "@/lib/actions/lottery.actions";

const scope = { orgId: "org_1", date: "2026-05-28" };
function form() {
  const data = new FormData();
  data.set("name", "Person");
  data.set("email", "person@example.com");
  data.set("consent", "true");
  data.set("cf-turnstile-response", "challenge-token");
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
      new Headers({ "x-vercel-forwarded-for": "203.0.113.10" }),
    );
    mocks.verify.mockResolvedValue(true);
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

  it("returns ordinary success for a verified duplicate without quota work", async () => {
    mocks.registrants.findOne.mockResolvedValue({ ...scope });
    expect(await enter()).toEqual({ success: true });
    expect(mocks.verify).toHaveBeenCalledOnce();
    expect(mocks.lotteries.updateOne).not.toHaveBeenCalled();
    expect(mocks.getLimits).toHaveBeenCalledTimes(2);
  });

  it("refuses registration when the public organization lookup is disabled", async () => {
    mocks.org.mockResolvedValue(null);

    expect(await enter()).toEqual(
      failed("This lottery page is not available."),
    );
    expect(mocks.registrants.findOne).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledOnce();
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

  it.each([0, 100])("returns full for cap %s and keeps attempts charged", async (cap) => {
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
    expect(mocks.limits.updateOne).not.toHaveBeenCalled();
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
      expect(mocks.limits.updateOne).not.toHaveBeenCalled();
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
    "keeps the IP attempt when the email limiter denies/throws (%s)",
    async (throws) => {
      if (throws)
        mocks.limits.findOneAndUpdate.mockResolvedValueOnce({ count: 1 }).mockRejectedValueOnce(
          new Error("limiter failed"),
        );
      else mocks.limits.findOneAndUpdate.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce(null);
      expect(await enter()).toEqual(
        failed(
          throws
            ? generic
            : "Too many registration attempts. Please try again later.",
        ),
      );
      expect(mocks.limits.updateOne).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    "keeps attempts charged after aborted insert failures (%s)",
    async (duplicate) => {
      mocks.registrants.insertOne.mockRejectedValue(
        duplicate ? { code: 11000 } : new Error("insert failed"),
      );
      if (duplicate) mocks.registrants.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...scope });
      expect(await enter()).toEqual(duplicate ? { success: true } : failed(generic));
      expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(1); // Initialization only.
      expect(mocks.limits.updateOne).not.toHaveBeenCalled();
    },
  );

  it("bounds initialization duplicate-race retries", async () => {
    mocks.lotteries.updateOne.mockRejectedValue({ code: 11000 });
    expect(await enter()).toEqual(failed(generic));
    expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(5);
    expect(mocks.limits.updateOne).not.toHaveBeenCalled();
  });

  it("returns unavailable when a duplicate-key error cannot be confirmed", async () => {
    mocks.registrants.insertOne.mockRejectedValue({ code: 11000 });
    expect(await enter()).toEqual(failed("Registration is currently unavailable. Please try again later."));
    expect(mocks.registrants.findOne).toHaveBeenLastCalledWith(
      { ...scope, email: "person@example.com" },
      { readPreference: "primary", readConcern: { level: "majority" } },
    );
  });

  it("charges the global IP budget before reading form fields or looking up the organization", async () => {
    const data = new FormData();
    mocks.limits.findOneAndUpdate.mockResolvedValueOnce(null);
    expect(await enterLottery("farm", data)).toEqual(failed("Too many registration attempts. Please try again later."));
    expect(mocks.org).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.limits.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.limits.findOneAndUpdate.mock.calls[0][0].key).toMatch(/^public-registration:ip:/);
  });

  it("charges malformed fields only to the IP budget", async () => {
    const data = form();
    data.set("name", " ");
    expect(await enterLottery("farm", data)).toMatchObject({ success: false });
    expect(mocks.limits.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each([
    ["name", "x".repeat(121)],
    ["email", "a".repeat(250) + "@example.com"],
    ["consent", "false"],
    ["cf-turnstile-response", ""],
    ["cf-turnstile-response", "x".repeat(2049)],
  ])("rejects invalid %s before Siteverify", async (field, value) => {
    const data = form();
    data.set(field, value);
    expect(await enterLottery("farm", data)).toMatchObject({ success: false });
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("uses the preferred Vercel header over the fallback", async () => {
    mocks.headers.mockResolvedValue(new Headers({
      "x-vercel-forwarded-for": "203.0.113.10",
      "x-forwarded-for": "198.51.100.8",
    }));
    expect(await enter()).toEqual({ success: true });
    expect(mocks.verify).toHaveBeenCalledWith("challenge-token", "203.0.113.10");
  });

  it("accepts the fallback header when the preferred one is absent", async () => {
    mocks.headers.mockResolvedValue(new Headers({ "x-forwarded-for": "198.51.100.8" }));
    expect(await enter()).toEqual({ success: true });
    expect(mocks.verify).toHaveBeenCalledWith("challenge-token", "198.51.100.8");
  });

  it("uses loopback for a missing header only in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      mocks.headers.mockResolvedValue(new Headers());
      expect(await enter()).toEqual({ success: true });
      expect(mocks.verify).toHaveBeenCalledWith("challenge-token", "127.0.0.1");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses a valid IP limit override and ignores malformed overrides", async () => {
    const previous = process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT;
    try {
      process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT = "7";
      expect(await enter()).toEqual({ success: true });
      expect(mocks.limits.findOneAndUpdate.mock.calls[0][0].count).toEqual({ $lt: 7 });
      mocks.limits.findOneAndUpdate.mockClear();
      process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT = "0x100";
      expect(await enter()).toEqual({ success: true });
      expect(mocks.limits.findOneAndUpdate.mock.calls[0][0].count).toEqual({ $lt: 500 });
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT;
      else process.env.PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT = previous;
    }
  });

  it("stops before Siteverify when the email and slug budget denies", async () => {
    mocks.limits.findOneAndUpdate.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce(null);
    expect(await enter()).toEqual(failed("Too many registration attempts. Please try again later."));
    expect(mocks.verify).not.toHaveBeenCalled();
    expect(mocks.org).not.toHaveBeenCalled();
  });

  it.each([
    { "x-vercel-forwarded-for": "bad", "x-forwarded-for": "203.0.113.10" },
    { "x-forwarded-for": "203.0.113.10, 198.51.100.8" },
    {},
  ])("rejects missing or malformed IP headers without charging", async (values) => {
    const requestHeaders = new Headers();
    for (const [name, value] of Object.entries(values)) {
      if (value) requestHeaders.set(name, value);
    }
    mocks.headers.mockResolvedValue(requestHeaders);
    expect(await enter()).toEqual(failed(generic));
    expect(mocks.getLimits).not.toHaveBeenCalled();
  });

  it("charges the email and canonical slug before Siteverify and organization lookup", async () => {
    mocks.verify.mockResolvedValue(false);
    expect(await enterLottery("FARM", form())).toEqual(failed("Security check failed. Please try again."));
    expect(mocks.limits.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mocks.limits.findOneAndUpdate.mock.calls[1][0].key).toMatch(/^public-registration:email-slug:/);
    expect(mocks.org).not.toHaveBeenCalled();
  });

  it("uses one global IP key across organizations and one email key for canonical slug variants", async () => {
    expect(await enterLottery("farm", form())).toEqual({ success: true });
    expect(await enterLottery("other-farm", form())).toEqual({ success: true });
    expect(await enterLottery("FARM", form())).toEqual({ success: true });
    const keys = mocks.limits.findOneAndUpdate.mock.calls.map((call) => call[0].key);
    expect(keys[0]).toBe(keys[2]);
    expect(keys[0]).toBe(keys[4]);
    expect(keys[1]).toBe(keys[5]);
    expect(mocks.limits.findOneAndUpdate.mock.calls[1][0].count).toEqual({ $lt: 10 });
  });

  it("retries initialization without resetting an existing lottery", async () => {
    mocks.lotteries.updateOne.mockRejectedValueOnce({ code: 11000 });
    expect(await enter()).toEqual({ success: true });
    expect(mocks.lotteries.updateOne).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])(
    "retains identity across transaction retries (%s)",
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
      expect(mocks.limits.updateOne).not.toHaveBeenCalled();
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
