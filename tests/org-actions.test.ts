import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
  insertOne: vi.fn(),
  updateOne: vi.fn(),
}));
const requireRoleMock = vi.hoisted(() => vi.fn());
const invalidateOrgCacheMock = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
}));

vi.mock("@/lib/plan-limits", () => ({
  getPlanLimit: vi.fn(() => 2000),
}));

vi.mock("@/lib/authz", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/org-cache", () => ({
  invalidateOrgCache: invalidateOrgCacheMock,
}));

vi.mock("@/lib/stripe", () => ({
  getOrCreateStripeCustomer: vi.fn(),
}));

const existingOrg = {
  clerkOrgId: "org_1",
  name: "Existing Org",
  slug: "existing-org",
  timezone: "America/Edmonton",
  publicPageEnabled: true,
  emailFromName: "Existing Org",
  emailFromAddress: "hello@example.com",
  subscriptionStatus: "trialing",
  planName: "free",
  maxRegistrantsPerDay: 100,
  createdAt: new Date("2026-05-01T00:00:00Z"),
  updatedAt: new Date("2026-05-01T00:00:00Z"),
};

async function loadActions() {
  return import("@/lib/actions/org.actions");
}

describe("createOrganization", () => {
  beforeEach(() => {
    organizationsCollection.findOne.mockReset().mockResolvedValue(null);
    organizationsCollection.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
    organizationsCollection.updateOne.mockReset();
    requireRoleMock.mockReset();
    invalidateOrgCacheMock.mockReset();
    authMock.mockReset().mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    delete process.env.STRIPE_SECRET_KEY;
  });

  it("rejects calls without an authenticated organization context", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: null });
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({
      success: false,
      error: "You must be signed in to an organization first.",
    });
    expect(organizationsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("stores a canonical slug", async () => {
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "  Canmore Food!! ",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({ success: true });

    expect(organizationsCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_1",
        slug: "canmore-food",
      })
    );
  });

  it("rejects client-supplied org identity", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_real" });
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        clerkOrgId: "org_attacker",
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({
      success: false,
      error: "Invalid organization details.",
    });

    expect(organizationsCollection.findOne).not.toHaveBeenCalled();
    expect(organizationsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("uses auth orgId for valid organization creation", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_real" });
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({ success: true });

    expect(organizationsCollection.findOne).toHaveBeenCalledWith({ clerkOrgId: "org_real" });
    expect(organizationsCollection.insertOne).toHaveBeenCalledWith(
      expect.objectContaining({
        clerkOrgId: "org_real",
      })
    );
  });

  it("returns success without inserting when the organization already exists", async () => {
    organizationsCollection.findOne.mockResolvedValue(existingOrg);
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({ success: true });

    expect(organizationsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("rejects reserved slugs without inserting", async () => {
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Dashboard Org",
        slug: "dashboard",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({
      success: false,
      error: "Invalid organization details.",
    });
    expect(organizationsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("rejects invalid timezones without inserting", async () => {
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "Mars/Basecamp",
      })
    ).resolves.toEqual({
      success: false,
      error: "Invalid organization details.",
    });
    expect(organizationsCollection.insertOne).not.toHaveBeenCalled();
  });

  it("returns a friendly duplicate slug error", async () => {
    organizationsCollection.insertOne.mockRejectedValue({ code: 11000, keyPattern: { slug: 1 } });
    const { createOrganization } = await loadActions();

    await expect(
      createOrganization({
        name: "Canmore Food",
        slug: "canmore-food",
        timezone: "America/Edmonton",
      })
    ).resolves.toEqual({
      success: false,
      error: "This slug is already in use. Please choose another.",
    });
  });
});

describe("updateOrganizationSettings", () => {
  beforeEach(() => {
    organizationsCollection.findOne.mockReset().mockResolvedValue(existingOrg);
    organizationsCollection.insertOne.mockReset();
    organizationsCollection.updateOne.mockReset().mockResolvedValue({ modifiedCount: 1 });
    requireRoleMock.mockReset().mockResolvedValue({ orgId: "org_1" });
    invalidateOrgCacheMock.mockReset();
  });

  it("rejects unknown settings keys before writing", async () => {
    const { updateOrganizationSettings } = await loadActions();

    const result = await updateOrganizationSettings({
      name: "Safe Name",
      planName: "scale",
    });

    expect(result).toEqual({ success: false, error: "Invalid organization settings." });
    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
  });

  it("does not allow mass assignment of subscription or billing fields", async () => {
    const { updateOrganizationSettings } = await loadActions();

    const result = await updateOrganizationSettings({
      subscriptionStatus: "active",
      maxRegistrantsPerDay: null,
      stripeCustomerId: "cus_attacker",
    });

    expect(result).toEqual({ success: false, error: "Invalid organization settings." });
    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
  });

  it("writes only parsed allowlisted settings plus updatedAt", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(
      updateOrganizationSettings({
        name: "  New Name  ",
        slug: "  New Farm!! ",
        timezone: " America/Vancouver ",
        publicPageEnabled: false,
        emailFromName: "  Ticket Desk  ",
        emailFromAddress: " HELLO@TICKETFARM.CA ",
      })
    ).resolves.toEqual({ success: true });

    expect(organizationsCollection.updateOne).toHaveBeenCalledWith(
      { clerkOrgId: "org_1" },
      {
        $set: {
          name: "New Name",
          slug: "new-farm",
          timezone: "America/Vancouver",
          publicPageEnabled: false,
          emailFromName: "Ticket Desk",
          emailFromAddress: "hello@ticketfarm.ca",
          updatedAt: expect.any(Date),
        },
      }
    );
    expect(invalidateOrgCacheMock).toHaveBeenCalledWith("existing-org");
    expect(invalidateOrgCacheMock).toHaveBeenCalledWith("new-farm");
  });

  it("rejects empty, too-short, too-long, and reserved slugs without writing", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ slug: "!!!" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });
    await expect(updateOrganizationSettings({ slug: "ab" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });
    await expect(updateOrganizationSettings({ slug: "a".repeat(64) })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });
    await expect(updateOrganizationSettings({ slug: "platform" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });

    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
    expect(invalidateOrgCacheMock).not.toHaveBeenCalled();
  });

  it("rejects invalid timezones without writing", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ timezone: "Mars/Basecamp" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });

    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
  });

  it("accepts UTC as a timezone", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ timezone: "UTC" })).resolves.toEqual({
      success: true,
    });

    expect(organizationsCollection.updateOne).toHaveBeenCalledWith(
      { clerkOrgId: "org_1" },
      {
        $set: {
          timezone: "UTC",
          updatedAt: expect.any(Date),
        },
      }
    );
  });

  it("rejects non-boolean public page values without writing", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ publicPageEnabled: "false" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });

    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
  });

  it("rejects invalid or unverified sender addresses without writing", async () => {
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ emailFromAddress: "not-an-email" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });
    await expect(updateOrganizationSettings({ emailFromAddress: "hello@example.com" })).resolves.toEqual({
      success: false,
      error: "Invalid organization settings.",
    });

    expect(organizationsCollection.updateOne).not.toHaveBeenCalled();
  });

  it("returns a friendly duplicate slug error", async () => {
    organizationsCollection.updateOne.mockRejectedValue({ code: 11000 });
    const { updateOrganizationSettings } = await loadActions();

    await expect(updateOrganizationSettings({ slug: "taken-slug" })).resolves.toEqual({
      success: false,
      error: "This slug is already in use. Please choose another.",
    });
  });
});
