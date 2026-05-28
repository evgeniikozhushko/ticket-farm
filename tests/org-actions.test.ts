import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationsCollection = vi.hoisted(() => ({
  updateOne: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
}));

vi.mock("@/lib/plan-limits", () => ({
  getPlanLimit: vi.fn(() => 2000),
}));

vi.mock("@/lib/authz", () => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/org-cache", () => ({
  invalidateOrgCache: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

describe("updateSubscriptionStatus", () => {
  beforeEach(() => {
    organizationsCollection.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
  });

  it("uses statusUpdatedAt guard so older out-of-order events are ignored by MongoDB", async () => {
    const { updateSubscriptionStatus } = await import("@/lib/actions/org.actions");
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
