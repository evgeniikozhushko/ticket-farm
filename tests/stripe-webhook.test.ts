import { beforeEach, describe, expect, it, vi } from "vitest";

const constructEventMock = vi.hoisted(() => vi.fn());
const processedCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
  insertOne: vi.fn(),
}));
const orgsCollection = vi.hoisted(() => ({
  findOne: vi.fn(),
  updateOne: vi.fn(),
}));
const updateSubscriptionStatusMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/stripe", () => ({
  getStripe: vi.fn(() => ({
    webhooks: { constructEvent: constructEventMock },
  })),
}));

vi.mock("@/lib/mongodb", () => ({
  getProcessedWebhookEventsCollection: vi.fn(() => Promise.resolve(processedCollection)),
  getOrganizationsCollection: vi.fn(() => Promise.resolve(orgsCollection)),
}));

vi.mock("@/lib/orgs", () => ({
  updateSubscriptionStatus: updateSubscriptionStatusMock,
}));

vi.mock("@/lib/plan-limits", () => ({
  getPlanFromPriceId: vi.fn(() => "growth"),
}));

function signedRequest() {
  return new Request("https://ticketfarm.test/api/webhooks/stripe", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "sig_123" },
  });
}

describe("Stripe webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    constructEventMock.mockReset();
    processedCollection.findOne.mockReset().mockResolvedValue(null);
    processedCollection.insertOne.mockReset().mockResolvedValue({ acknowledged: true });
    orgsCollection.findOne.mockReset();
    orgsCollection.updateOne.mockReset();
    updateSubscriptionStatusMock.mockReset().mockResolvedValue(undefined);
  });

  it("rejects invalid signatures", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    constructEventMock.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const response = await POST(signedRequest() as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid signature" });
    expect(processedCollection.findOne).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("skips duplicate events already recorded as processed", async () => {
    constructEventMock.mockReturnValue({ id: "evt_1", created: 1779976800, type: "customer.subscription.updated", data: { object: {} } });
    processedCollection.findOne.mockResolvedValue({ stripeEventId: "evt_1" });
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const response = await POST(signedRequest() as never);

    expect(response.status).toBe(200);
    expect(updateSubscriptionStatusMock).not.toHaveBeenCalled();
    expect(processedCollection.insertOne).not.toHaveBeenCalled();
  });

  it("updates org subscription from newer subscription events and records the event", async () => {
    constructEventMock.mockReturnValue({
      id: "evt_2",
      created: 1779976800,
      type: "customer.subscription.updated",
      data: {
        object: {
          customer: "cus_123",
          status: "active",
          items: { data: [{ price: { id: "price_growth" } }] },
        },
      },
    });
    const { POST } = await import("@/app/api/webhooks/stripe/route");

    const response = await POST(signedRequest() as never);

    expect(response.status).toBe(200);
    expect(updateSubscriptionStatusMock).toHaveBeenCalledWith(
      "cus_123",
      "active",
      "growth",
      new Date(1779976800 * 1000)
    );
    expect(processedCollection.insertOne).toHaveBeenCalledWith({
      stripeEventId: "evt_2",
      processedAt: expect.any(Date),
    });
  });
});
