import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getOrganization } from "@/lib/actions/org.actions";
import { getStripe } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (orgRole !== "org:admin") {
    return NextResponse.json({ error: "Forbidden: admin role required" }, { status: 403 });
  }

  const org = await getOrganization(orgId);
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }
  if (!org.stripeCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe first." },
      { status: 400 }
    );
  }

  // Note: The portal is intentionally accessible even on past_due / canceled —
  // blocking it would prevent admins from resolving payment issues.

  const origin = req.headers.get("origin") ?? "https://ticketfarm.ca";

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripeCustomerId,
    return_url: `${origin}/billing`,
  });

  return NextResponse.json({ url: session.url });
}
