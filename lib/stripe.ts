import Stripe from "stripe";
import { getOrganizationsCollection } from "@/lib/mongodb";

// ---------------------------------------------------------------------------
// Lazy singleton — avoids re-instantiating on every serverless invocation.
// ---------------------------------------------------------------------------

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-01-28.clover",
    });
  }
  return _stripe;
}

// ---------------------------------------------------------------------------
// Customer management
// ---------------------------------------------------------------------------

/**
 * Return the Stripe customer ID for the given org, creating one if it doesn't
 * exist yet. Persists the customer ID back to the organizations collection.
 *
 * Should only be called from server-side code where STRIPE_SECRET_KEY is set.
 */
export async function getOrCreateStripeCustomer(
  clerkOrgId: string,
  orgName: string,
  email?: string
): Promise<string> {
  const orgsCollection = await getOrganizationsCollection();
  const org = await orgsCollection.findOne({ clerkOrgId });

  if (!org) throw new Error(`Organization not found: ${clerkOrgId}`);

  if (org.stripeCustomerId) {
    return org.stripeCustomerId;
  }

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: orgName,
    ...(email ? { email } : {}),
    metadata: { clerkOrgId },
  });

  await orgsCollection.updateOne(
    { clerkOrgId },
    { $set: { stripeCustomerId: customer.id, updatedAt: new Date() } }
  );

  return customer.id;
}
