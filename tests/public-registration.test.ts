import { beforeEach, describe, expect, it, vi } from "vitest";

const lotteriesCollection = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));
const registrantsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
  insertOne: vi.fn(),
}));
const rateLimitsCollection = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));
const getOrgBySlugMock = vi.hoisted(() => vi.fn());
const headersMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mongodb", () => ({
  getLotteriesCollection: vi.fn(() => Promise.resolve(lotteriesCollection)),
  getRegistrantsCollection: vi.fn(() => Promise.resolve(registrantsCollection)),
  getPublicRegistrationRateLimitsCollection: vi.fn(() => Promise.resolve(rateLimitsCollection)),
}));

vi.mock("@/lib/org-cache", () => ({
  getOrgBySlug: getOrgBySlugMock,
}));

vi.mock("@/lib/date", () => ({
  getTodayDateString: vi.fn(() => "2026-05-28"),
}));

vi.mock("next/headers", () => ({
  headers: headersMock,
}));

function validForm(email = "person@example.com") {
  const formData = new FormData();
  formData.set("name", "Person");
  formData.set("email", email);
  formData.set("consent", "true");
  return formData;
}

async function loadAction() {
  vi.resetModules();
  return import("@/lib/actions/lottery.actions");
}

describe("public registration", () => {
  beforeEach(() => {
    lotteriesCollection.findOneAndUpdate.mockReset();
    lotteriesCollection.updateOne.mockReset();
    registrantsCollection.findOne.mockReset();
    registrantsCollection.insertOne.mockReset();
    rateLimitsCollection.findOneAndUpdate.mockReset();
    rateLimitsCollection.updateOne.mockReset();
    getOrgBySlugMock.mockReset();
    headersMock.mockReset();

    getOrgBySlugMock.mockResolvedValue({
      clerkOrgId: "org_1",
      timezone: "America/Edmonton",
      maxRegistrantsPerDay: 100,
    });
    headersMock.mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    rateLimitsCollection.findOneAndUpdate.mockResolvedValue({ count: 1 });
    lotteriesCollection.findOneAndUpdate.mockResolvedValue({ orgId: "org_1", date: "2026-05-28" });
    registrantsCollection.findOne.mockResolvedValue(null);
    registrantsCollection.insertOne.mockResolvedValue({ acknowledged: true });
    lotteriesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
    rateLimitsCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("returns the duplicate message before consuming quota or rate limits when already entered", async () => {
    registrantsCollection.findOne.mockResolvedValue({
      orgId: "org_1",
      email: "person@example.com",
      date: "2026-05-28",
    });
    const { enterLottery } = await loadAction();

    const result = await enterLottery("farm", validForm());

    expect(result).toEqual({
      success: false,
      error: "You've already entered today's lottery. Please check back tomorrow.",
    });
    expect(lotteriesCollection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(rateLimitsCollection.findOneAndUpdate).not.toHaveBeenCalled();
    expect(registrantsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("returns the quota message when no quota slot is available", async () => {
    lotteriesCollection.findOneAndUpdate.mockResolvedValue(null);
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Registration is full for today. Check back tomorrow.",
    });
    expect(registrantsCollection.insertOne).not.toHaveBeenCalled();
    expect(rateLimitsCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("claims a quota slot on legacy lottery documents missing registrantCount", async () => {
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({ success: true });

    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orgId: "org_1",
        date: "2026-05-28",
        status: { $ne: "LOTTERY_DRAWN" },
        $or: [
          { registrantCount: { $lt: 100 } },
          { registrantCount: { $exists: false } },
        ],
      },
      {
        $inc: { registrantCount: 1 },
        $setOnInsert: {
          orgId: "org_1",
          date: "2026-05-28",
          status: "OPEN",
          dailyTheme: "",
          maxTicketsAvailable: 0,
        },
      },
      { upsert: true, returnDocument: "after" }
    );
    expect(rateLimitsCollection.findOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(registrantsCollection.insertOne).toHaveBeenCalledWith({
      orgId: "org_1",
      name: "Person",
      email: "person@example.com",
      date: "2026-05-28",
      enteredAt: expect.any(Date),
    });
    expect(registrantsCollection.findOne.mock.invocationCallOrder[0]).toBeLessThan(
      lotteriesCollection.findOneAndUpdate.mock.invocationCallOrder[0]
    );
    expect(lotteriesCollection.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      rateLimitsCollection.findOneAndUpdate.mock.invocationCallOrder[0]
    );
    expect(rateLimitsCollection.findOneAndUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      registrantsCollection.insertOne.mock.invocationCallOrder[0]
    );
  });

  it("does not add a registrantCount guard for unlimited plans", async () => {
    getOrgBySlugMock.mockResolvedValue({
      clerkOrgId: "org_1",
      timezone: "America/Edmonton",
      maxRegistrantsPerDay: null,
    });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({ success: true });

    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orgId: "org_1",
        date: "2026-05-28",
        status: { $ne: "LOTTERY_DRAWN" },
      },
      expect.any(Object),
      { upsert: true, returnDocument: "after" }
    );
  });

  it("treats legacy orgs missing maxRegistrantsPerDay as unlimited", async () => {
    getOrgBySlugMock.mockResolvedValue({
      clerkOrgId: "org_1",
      timezone: "America/Edmonton",
    });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({ success: true });

    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orgId: "org_1",
        date: "2026-05-28",
        status: { $ne: "LOTTERY_DRAWN" },
      },
      expect.any(Object),
      { upsert: true, returnDocument: "after" }
    );
  });

  it("treats legacy non-finite org limits as unlimited", async () => {
    getOrgBySlugMock.mockResolvedValue({
      clerkOrgId: "org_1",
      timezone: "America/Edmonton",
      maxRegistrantsPerDay: Infinity,
    });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({ success: true });

    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalledWith(
      {
        orgId: "org_1",
        date: "2026-05-28",
        status: { $ne: "LOTTERY_DRAWN" },
      },
      expect.any(Object),
      { upsert: true, returnDocument: "after" }
    );
  });

  it("rolls back quota and consumed rate limits on any insert failure", async () => {
    registrantsCollection.insertOne.mockRejectedValue(new Error("write failed"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Something went wrong on our side. Please try again.",
    });
    expect(lotteriesCollection.updateOne).toHaveBeenCalledWith(
      { orgId: "org_1", date: "2026-05-28" },
      { $inc: { registrantCount: -1 } }
    );
    expect(rateLimitsCollection.updateOne).toHaveBeenCalledTimes(2);
    expect(rateLimitsCollection.updateOne).toHaveBeenCalledWith(
      { key: expect.any(String), count: { $gt: 0 } },
      { $inc: { count: -1 }, $set: { updatedAt: expect.any(Date) } }
    );
    errorSpy.mockRestore();
  });

  it("returns the duplicate message and rolls back quota and rate limits when insert races the duplicate precheck", async () => {
    registrantsCollection.insertOne.mockRejectedValue({ code: 11000 });
    const { enterLottery } = await loadAction();

    const result = await enterLottery("farm", validForm());

    expect(result).toEqual({
      success: false,
      error: "You've already entered today's lottery. Please check back tomorrow.",
    });
    expect(lotteriesCollection.updateOne).toHaveBeenCalledWith(
      { orgId: "org_1", date: "2026-05-28" },
      { $inc: { registrantCount: -1 } }
    );
    expect(rateLimitsCollection.updateOne).toHaveBeenCalledTimes(2);
  });

  it("retries quota upsert duplicate races and logs after retry exhaustion", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    lotteriesCollection.findOneAndUpdate.mockRejectedValue({ code: 11000 });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Something went wrong on our side. Please try again.",
    });

    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalledTimes(5);
    expect(errorSpy).toHaveBeenCalledWith("[quota] retry exhausted after", 5, "attempts");
    errorSpy.mockRestore();
  });

  it("returns the rate-limit message and rolls back quota when IP or email attempts are capped", async () => {
    rateLimitsCollection.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({ count: 1 });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Too many registration attempts. Please try again later.",
    });
    expect(lotteriesCollection.findOneAndUpdate).toHaveBeenCalled();
    expect(lotteriesCollection.updateOne).toHaveBeenCalledWith(
      { orgId: "org_1", date: "2026-05-28" },
      { $inc: { registrantCount: -1 } }
    );
    expect(registrantsCollection.insertOne).not.toHaveBeenCalled();
    expect(rateLimitsCollection.updateOne).toHaveBeenCalledTimes(1);
  });
});
