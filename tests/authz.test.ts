import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

describe("requireRole", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated users", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    const { requireRole } = await import("@/lib/authz");

    await expect(requireRole("org:member")).rejects.toThrow("not authenticated");
  });

  it("rejects authenticated users without org context", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: null, orgRole: null });
    const { requireRole } = await import("@/lib/authz");

    await expect(requireRole("org:member")).rejects.toThrow("no organization context");
  });

  it("blocks members from admin-only access", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: "org:member" });
    const { requireRole } = await import("@/lib/authz");

    await expect(requireRole("org:admin")).rejects.toThrow("admin role required");
  });

  it("allows admins", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: "org:admin" });
    const { requireRole } = await import("@/lib/authz");

    await expect(requireRole("org:admin")).resolves.toEqual({
      userId: "user_1",
      orgId: "org_1",
      orgRole: "org:admin",
    });
  });
});

describe("requirePlatformAdmin", () => {
  beforeEach(() => {
    authMock.mockReset();
    vi.unstubAllEnvs();
  });

  it("rejects unauthenticated users", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null, orgRole: null });
    vi.stubEnv("PLATFORM_ADMIN_USER_IDS", "user_1");
    const { requirePlatformAdmin } = await import("@/lib/authz");

    await expect(requirePlatformAdmin()).rejects.toThrow("not authenticated");
  });

  it("rejects users outside the platform admin allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_2", orgId: "org_1", orgRole: "org:admin" });
    vi.stubEnv("PLATFORM_ADMIN_USER_IDS", "user_1,user_3");
    const { requirePlatformAdmin } = await import("@/lib/authz");

    await expect(requirePlatformAdmin()).rejects.toThrow("platform admin required");
  });

  it("allows allowlisted users without org context", async () => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: null, orgRole: null });
    vi.stubEnv("PLATFORM_ADMIN_USER_IDS", " user_1 , user_3 ");
    const { requirePlatformAdmin } = await import("@/lib/authz");

    await expect(requirePlatformAdmin()).resolves.toEqual({ userId: "user_1" });
  });
});
