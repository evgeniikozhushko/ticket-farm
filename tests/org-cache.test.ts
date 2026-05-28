import { beforeEach, describe, expect, it, vi } from "vitest";

const organizationsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
}));

describe("org slug cache", () => {
  beforeEach(async () => {
    vi.resetModules();
    organizationsCollection.findOne.mockReset();
  });

  it("hits the database on a cache miss", async () => {
    const org = { clerkOrgId: "org_1", slug: "farm", publicPageEnabled: true };
    organizationsCollection.findOne.mockResolvedValue(org);
    const { getOrgBySlug } = await import("@/lib/org-cache");

    await expect(getOrgBySlug("farm")).resolves.toBe(org);

    expect(organizationsCollection.findOne).toHaveBeenCalledWith({
      slug: "farm",
      publicPageEnabled: true,
    });
  });

  it("serves cache hits without another database read", async () => {
    const org = { clerkOrgId: "org_1", slug: "farm", publicPageEnabled: true };
    organizationsCollection.findOne.mockResolvedValue(org);
    const { getOrgBySlug } = await import("@/lib/org-cache");

    await getOrgBySlug("farm");
    await getOrgBySlug("farm");

    expect(organizationsCollection.findOne).toHaveBeenCalledOnce();
  });

  it("invalidation removes stale entries", async () => {
    const firstOrg = { clerkOrgId: "org_1", slug: "farm", publicPageEnabled: true };
    const secondOrg = { clerkOrgId: "org_2", slug: "farm", publicPageEnabled: true };
    organizationsCollection.findOne.mockResolvedValueOnce(firstOrg).mockResolvedValueOnce(secondOrg);
    const { getOrgBySlug, invalidateOrgCache } = await import("@/lib/org-cache");

    await expect(getOrgBySlug("farm")).resolves.toBe(firstOrg);
    invalidateOrgCache("farm");
    await expect(getOrgBySlug("farm")).resolves.toBe(secondOrg);

    expect(organizationsCollection.findOne).toHaveBeenCalledTimes(2);
  });
});
