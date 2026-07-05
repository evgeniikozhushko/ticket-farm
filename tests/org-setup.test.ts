import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const clerkClientMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn());
const organizationsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
}));
const createOrganizationMock = vi.hoisted(() => vi.fn());
const getClerkOrganizationMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  clerkClient: clerkClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
}));

vi.mock("@/lib/actions/org.actions", () => ({
  createOrganization: createOrganizationMock,
}));

describe("organization setup guards", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    organizationsCollection.findOne.mockReset();
    createOrganizationMock.mockReset();
    getClerkOrganizationMock.mockReset();
    clerkClientMock.mockReset();
    clerkClientMock.mockResolvedValue({
      organizations: { getOrganization: getClerkOrganizationMock },
    });
  });

  it("routes signed-in users without a Clerk org to onboarding", async () => {
    const { getAuthenticatedOrgHomePath } = await import("@/lib/org-setup");

    await expect(getAuthenticatedOrgHomePath(null)).resolves.toBe("/onboarding");
    expect(organizationsCollection.findOne).not.toHaveBeenCalled();
  });

  it("routes Clerk orgs without Mongo documents back to onboarding", async () => {
    organizationsCollection.findOne.mockResolvedValue(null);
    const { getAuthenticatedOrgHomePath } = await import("@/lib/org-setup");

    await expect(getAuthenticatedOrgHomePath("org_1")).resolves.toBe("/onboarding");
    expect(organizationsCollection.findOne).toHaveBeenCalledWith(
      { clerkOrgId: "org_1" },
      { projection: { _id: 1 } }
    );
  });

  it("routes fully set up orgs to the dashboard", async () => {
    organizationsCollection.findOne.mockResolvedValue({ _id: "mongo_1" });
    const { getAuthenticatedOrgHomePath } = await import("@/lib/org-setup");

    await expect(getAuthenticatedOrgHomePath("org_1")).resolves.toBe("/dashboard/lottery");
  });

  it("redirects dashboard users with missing Mongo orgs to onboarding", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: "org:admin" });
    organizationsCollection.findOne.mockResolvedValue(null);
    const { requireOrganizationDocument } = await import("@/lib/org-setup");

    await expect(requireOrganizationDocument()).rejects.toThrow("REDIRECT:/onboarding");
  });
});

describe("ensureOrganizationDocument", () => {
  beforeEach(() => {
    authMock.mockReset();
    redirectMock.mockReset();
    redirectMock.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    organizationsCollection.findOne.mockReset();
    createOrganizationMock.mockReset();
    getClerkOrganizationMock.mockReset();
    clerkClientMock.mockReset();
    clerkClientMock.mockResolvedValue({
      organizations: { getOrganization: getClerkOrganizationMock },
    });
  });

  it("returns needs-clerk-org when there is no active Clerk org", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: null });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).resolves.toEqual({ status: "needs-clerk-org" });
    expect(getClerkOrganizationMock).not.toHaveBeenCalled();
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it("returns ok when Mongo already has the org, without fetching Clerk or creating", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    organizationsCollection.findOne.mockResolvedValue({ _id: "mongo_1" });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).resolves.toEqual({ status: "ok" });
    expect(getClerkOrganizationMock).not.toHaveBeenCalled();
    expect(createOrganizationMock).not.toHaveBeenCalled();
  });

  it("auto-provisions the Mongo org from Clerk metadata when missing", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    organizationsCollection.findOne.mockResolvedValue(null);
    getClerkOrganizationMock.mockResolvedValue({ name: "Canmore Food Barn", slug: "canmore-food-barn" });
    createOrganizationMock.mockResolvedValue({ success: true });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).resolves.toEqual({ status: "ok" });
    expect(getClerkOrganizationMock).toHaveBeenCalledWith({ organizationId: "org_1" });
    expect(createOrganizationMock).toHaveBeenCalledWith({
      name: "Canmore Food Barn",
      slug: "canmore-food-barn",
      timezone: "America/Edmonton",
    });
  });

  it("falls back to normalized name when Clerk slug is empty", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    organizationsCollection.findOne.mockResolvedValue(null);
    getClerkOrganizationMock.mockResolvedValue({ name: "Canmore Food Barn", slug: "" });
    createOrganizationMock.mockResolvedValue({ success: true });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await ensureOrganizationDocument();
    expect(createOrganizationMock).toHaveBeenCalledWith({
      name: "Canmore Food Barn",
      slug: "canmore-food-barn",
      timezone: "America/Edmonton",
    });
  });

  it("returns needs-form with defaultSlug and error when createOrganization fails", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1" });
    organizationsCollection.findOne.mockResolvedValue(null);
    getClerkOrganizationMock.mockResolvedValue({ name: "Dashboard", slug: "dashboard" });
    createOrganizationMock.mockResolvedValue({ success: false, error: "This slug is reserved. Please choose another." });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).resolves.toEqual({
      status: "needs-form",
      defaultSlug: "dashboard",
      error: "This slug is reserved. Please choose another.",
    });
  });

  it("falls back to needs-clerk-org when Clerk org fetch fails", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_stale" });
    organizationsCollection.findOne.mockResolvedValue(null);
    getClerkOrganizationMock.mockRejectedValue(new Error("Not Found"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).resolves.toEqual({ status: "needs-clerk-org" });
    expect(createOrganizationMock).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("redirects unauthenticated callers to /sign-in", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    const { ensureOrganizationDocument } = await import("@/lib/org-setup");

    await expect(ensureOrganizationDocument()).rejects.toThrow("REDIRECT:/sign-in");
  });
});
