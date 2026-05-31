import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());
const getOrCreateStripeCustomerMock = vi.hoisted(() => vi.fn());
const checkoutCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("@/lib/actions/org.actions", () => ({
  getOrganization: getOrganizationMock,
}));

vi.mock("@/lib/stripe", () => ({
  getOrCreateStripeCustomer: getOrCreateStripeCustomerMock,
  getStripe: vi.fn(() => ({
    checkout: {
      sessions: {
        create: checkoutCreateMock,
      },
    },
  })),
}));

function checkoutRequest(body: unknown) {
  return new NextRequest("https://ticketfarm.test/api/billing/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      origin: "https://ticketfarm.test",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/create-checkout", () => {
  beforeEach(() => {
    authMock.mockReset().mockResolvedValue({
      userId: "user_1",
      orgId: "org_1",
      orgRole: "org:admin",
    });
    getOrganizationMock.mockReset().mockResolvedValue({
      clerkOrgId: "org_1",
      name: "Canmore Food",
      emailFromAddress: "hello@example.com",
    });
    getOrCreateStripeCustomerMock.mockReset().mockResolvedValue("cus_123");
    checkoutCreateMock.mockReset().mockResolvedValue({ url: "https://stripe.test/session" });
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_GROWTH_PRICE_ID = "price_growth";
    process.env.STRIPE_SCALE_PRICE_ID = "price_scale";
  });

  it("rejects raw price IDs from the client", async () => {
    const { POST } = await import("@/app/api/billing/create-checkout/route");

    const response = await POST(checkoutRequest({ priceId: "price_growth" }));

    await expect(response.json()).resolves.toEqual({ error: "Unknown billing plan" });
    expect(response.status).toBe(400);
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("rejects unknown billing plans", async () => {
    const { POST } = await import("@/app/api/billing/create-checkout/route");

    const response = await POST(checkoutRequest({ planName: "legacy" }));

    await expect(response.json()).resolves.toEqual({ error: "Unknown billing plan" });
    expect(response.status).toBe(400);
    expect(checkoutCreateMock).not.toHaveBeenCalled();
  });

  it("resolves the Stripe price ID server-side for a known plan", async () => {
    const { POST } = await import("@/app/api/billing/create-checkout/route");

    const response = await POST(checkoutRequest({ planName: "growth" }));

    await expect(response.json()).resolves.toEqual({ url: "https://stripe.test/session" });
    expect(response.status).toBe(200);
    expect(checkoutCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [{ price: "price_growth", quantity: 1 }],
      })
    );
  });
});
