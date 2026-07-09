import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
}));

vi.mock("@/lib/plan-limits", () => ({
  getPlanLimit: vi.fn(() => 2000),
}));

async function loadOrgs() {
  vi.resetModules();
  return import("@/lib/orgs");
}

describe("org DB helpers", () => {
  beforeEach(() => {
    organizationsCollection.findOne.mockReset();
    organizationsCollection.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  });

  it("gets an organization by Clerk org ID", async () => {
    const org = { clerkOrgId: "org_1", name: "Ticket Farm" };
    organizationsCollection.findOne.mockResolvedValue(org);
    const { getOrganization } = await loadOrgs();

    await expect(getOrganization("org_1")).resolves.toBe(org);

    expect(organizationsCollection.findOne).toHaveBeenCalledWith({
      clerkOrgId: "org_1",
    });
  });

  it("uses statusUpdatedAt guard so older out-of-order events are ignored by MongoDB", async () => {
    const { updateSubscriptionStatus } = await loadOrgs();
    const eventTimestamp = new Date("2026-05-28T12:00:00Z");

    await updateSubscriptionStatus("cus_123", "active", "growth", eventTimestamp);

    expect(organizationsCollection.updateOne).toHaveBeenCalledWith(
      {
        stripeCustomerId: "cus_123",
        $or: [
          { statusUpdatedAt: { $exists: false } },
          { statusUpdatedAt: { $lt: eventTimestamp } },
        ],
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          subscriptionStatus: "active",
          planName: "growth",
          maxRegistrantsPerDay: 2000,
          statusUpdatedAt: eventTimestamp,
        }),
      })
    );
  });
});
