import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/actions/org.actions";
import { getAppUrl } from "@/lib/app-url";
import { getPriceIdForPlan } from "@/lib/plan-limits";
import { getStripe, getOrCreateStripeCustomer } from "@/lib/stripe";
import type { PlanName } from "@/lib/types";

const CHECKOUT_PLANS = new Set<PlanName>(["starter", "growth", "scale"]);

export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (orgRole !== "org:admin") {
    return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { planName } = body as { planName?: unknown };

  if (typeof planName !== "string" || !CHECKOUT_PLANS.has(planName as PlanName)) {
    return NextResponse.json({ error: "Unknown billing plan" }, { status: 400 });
  }

  const priceId = getPriceIdForPlan(planName as PlanName);

  if (!priceId) {
    return NextResponse.json({ error: "Billing plan is not available" }, { status: 400 });
  }

  let appUrl: string;
  try {
    appUrl = getAppUrl();
  } catch (err) {
    console.error("[billing checkout] Invalid APP_URL configuration:", err);
    return NextResponse.json({ error: "Billing is not configured" }, { status: 500 });
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(
    orgId,
    org.name,
    org.emailFromAddress
  );

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    client_reference_id: orgId,
    metadata: { clerkOrgId: orgId },
    subscription_data: {
      metadata: { clerkOrgId: orgId },
    },
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/billing?success=1`,
    cancel_url: `${appUrl}/billing`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
