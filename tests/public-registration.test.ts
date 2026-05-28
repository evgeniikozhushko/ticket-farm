import { beforeEach, describe, expect, it, vi } from "vitest";

const lotteriesCollection = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  updateOne: vi.fn(),
}));
const registrantsCollection = vi.hoisted(() => ({
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
    registrantsCollection.insertOne.mockResolvedValue({ acknowledged: true });
    lotteriesCollection.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("returns the duplicate message when insertOne hits the duplicate index", async () => {
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
  });

  it("returns the quota message when no quota slot is available", async () => {
    lotteriesCollection.findOneAndUpdate.mockResolvedValue(null);
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Registration is full for today. Check back tomorrow.",
    });
    expect(registrantsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("rolls back quota on any insert failure", async () => {
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
    errorSpy.mockRestore();
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

  it("returns the rate-limit message when IP or email attempts are capped", async () => {
    rateLimitsCollection.findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce({ count: 1 });
    const { enterLottery } = await loadAction();

    await expect(enterLottery("farm", validForm())).resolves.toEqual({
      success: false,
      error: "Too many registration attempts. Please try again later.",
    });
    expect(lotteriesCollection.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
