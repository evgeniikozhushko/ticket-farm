import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());
const portalCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/orgs", () => ({
  getOrganization: getOrganizationMock,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    billingPortal: {
      sessions: {
        create: portalCreateMock,
      },
    },
  })),
}));

describe("POST /api/billing/create-portal", () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({
      userId: "user_1",
      orgId: "org_1",
      orgRole: "org:admin",
    });
    getOrganizationMock.mockReset().mockResolvedValue({
      clerkOrgId: "org_1",
      stripeCustomerId: "cus_123",
    });
    portalCreateMock.mockReset().mockResolvedValue({ url: "https://stripe.test/portal" });
    process.env.APP_URL = "https://ticketfarm.test/";
  });

  it("uses APP_URL when building the Stripe portal return URL", async () => {
    const { POST } = await import("@/app/api/billing/create-portal/route");

    const response = await POST();

    await expect(response.json()).resolves.toEqual({ url: "https://stripe.test/portal" });
    expect(response.status).toBe(200);
    expect(portalCreateMock).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://ticketfarm.test/billing",
    });
  });

  it("ignores request Origin when building the Stripe portal return URL", async () => {
    process.env.APP_URL = "https://ticketfarm.ca";
    const { POST } = await import("@/app/api/billing/create-portal/route");

    const response = await POST();

    expect(response.status).toBe(200);
    expect(portalCreateMock).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: "https://ticketfarm.ca/billing",
    });
  });

  it("fails closed when APP_URL is missing", async () => {
    delete process.env.APP_URL;
    const { POST } = await import("@/app/api/billing/create-portal/route");

    const response = await POST();

    await expect(response.json()).resolves.toEqual({ error: "Billing is not configured" });
    expect(response.status).toBe(500);
    expect(portalCreateMock).not.toHaveBeenCalled();
  });

  it("fails closed when APP_URL is invalid", async () => {
    process.env.APP_URL = "ftp://ticketfarm.test";
    const { POST } = await import("@/app/api/billing/create-portal/route");

    const response = await POST();

    await expect(response.json()).resolves.toEqual({ error: "Billing is not configured" });
    expect(response.status).toBe(500);
    expect(portalCreateMock).not.toHaveBeenCalled();
  });
});
