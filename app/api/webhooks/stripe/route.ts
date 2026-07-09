import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getProcessedWebhookEventsCollection, getOrganizationsCollection } from "@/lib/mongodb";
import { isDuplicateKeyError } from "@/lib/mongo-errors";
import { updateSubscriptionStatus } from "@/lib/orgs";
import { getPlanFromPriceId } from "@/lib/plan-limits";
import type { SubscriptionStatus } from "@/lib/types";

// Raw body is required for Stripe signature verification — do NOT parse as JSON.
export const runtime = "nodejs";

function stripeStatusToOurs(stripeStatus: string): SubscriptionStatus {
  if (stripeStatus === "trialing") return "trialing";
  if (stripeStatus === "active")   return "active";
  if (stripeStatus === "past_due" || stripeStatus === "unpaid") return "past_due";
  if (stripeStatus === "canceled" || stripeStatus === "incomplete_expired") return "canceled";
  return "free";
}

export async function POST(req: NextRequest) {
  // ---------------------------------------------------------------------------
  // 1. Verify Stripe signature — reject anything without a valid signature.
  // ---------------------------------------------------------------------------
  const rawBody = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // ---------------------------------------------------------------------------
  // 2. Idempotency check — skip events we've already processed.
  //    Primary gate: unique index on { stripeEventId }.
  // ---------------------------------------------------------------------------
  const processedCollection = await getProcessedWebhookEventsCollection();
  const alreadyProcessed = await processedCollection.findOne({ stripeEventId: event.id });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true });
  }

  const eventTs = new Date(event.created * 1000);

  // ---------------------------------------------------------------------------
  // 3. Route by event type.
  //    WRITE ORDER: update organizations FIRST, then insert processed event.
  //    If the processed insert fails Stripe retries; statusUpdatedAt guard makes
  //    the re-applied org update a no-op (no state drift).
  // ---------------------------------------------------------------------------
  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const priceId = sub.items.data[0]?.price?.id ?? "";
        const planName = getPlanFromPriceId(priceId);
        const newStatus = stripeStatusToOurs(sub.status);

        await updateSubscriptionStatus(stripeCustomerId, newStatus, planName, eventTs);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const stripeCustomerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer.id;

        await updateSubscriptionStatus(stripeCustomerId, "canceled", "free", eventTs);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const stripeCustomerId =
          typeof invoice.customer === "string" ? invoice.customer : (invoice.customer as Stripe.Customer).id;

        // Preserve current planName — only status changes to past_due.
        const orgsCollection = await getOrganizationsCollection();
        const org = await orgsCollection.findOne({ stripeCustomerId });
        const currentPlan = org?.planName ?? "free";

        await updateSubscriptionStatus(stripeCustomerId, "past_due", currentPlan, eventTs);
        break;
      }

      case "checkout.session.completed": {
        // Defensive: ensure stripeCustomerId is persisted on the org if it wasn't
        // created at onboarding (e.g. manual Stripe portal signup).
        const session = event.data.object as Stripe.Checkout.Session;
        const stripeCustomerId =
          typeof session.customer === "string" ? session.customer : null;
        const metadata = session.metadata as Record<string, string> | null;
        const clerkOrgId = metadata?.clerkOrgId ?? session.client_reference_id ?? undefined;

        if (stripeCustomerId && clerkOrgId) {
          const orgsCollection = await getOrganizationsCollection();
          await orgsCollection.updateOne(
            { clerkOrgId, stripeCustomerId: { $exists: false } },
            { $set: { stripeCustomerId, updatedAt: new Date() } }
          );
        }
        break;
      }

      default:
        // Unknown event types are silently ignored — return 200 to prevent Stripe retries.
        break;
    }

    // -------------------------------------------------------------------------
    // 4. Mark event as processed AFTER the org update succeeded.
    // -------------------------------------------------------------------------
    try {
      await processedCollection.insertOne({
        stripeEventId: event.id,
        processedAt: new Date(),
      });
    } catch (err) {
      if (!isDuplicateKeyError(err)) {
        throw err;
      }
    }
  } catch (err) {
    console.error("[stripe-webhook] Handler error:", err);
    // Return 500 so Stripe retries. The idempotency check at the top prevents
    // double-processing if the org update already succeeded.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
