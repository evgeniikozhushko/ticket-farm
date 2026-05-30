"use server";

import { getOrganizationsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
import { invalidateOrgCache } from "@/lib/org-cache";
import { getPlanLimit } from "@/lib/plan-limits";
import { getOrCreateStripeCustomer } from "@/lib/stripe";
import type { Organization, PlanName, SubscriptionStatus } from "@/lib/types";

// Re-export for consumers that only need the helper
export { getPlanLimit };

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOrganization(input: {
  clerkOrgId: string;
  name: string;
  slug: string;
  timezone: string;
}): Promise<{ success: true }> {
  // Called during onboarding — user is authenticated but org doc may not exist yet
  const collection = await getOrganizationsCollection();

  const now = new Date();
  const org: Omit<Organization, "_id"> = {
    clerkOrgId: input.clerkOrgId,
    name: input.name,
    slug: input.slug,
    timezone: input.timezone,
    publicPageEnabled: true,
    emailFromName: input.name,
    emailFromAddress: "hello@ticketfarm.ca",
    subscriptionStatus: "trialing",
    planName: "free",
    maxRegistrantsPerDay: getPlanLimit("free"),
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(org);

  // Create a Stripe customer immediately so the billing flow is ready from day 1.
  // This is best-effort — a Stripe failure must not block org creation.
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      await getOrCreateStripeCustomer(input.clerkOrgId, input.name);
    } catch (err) {
      console.error("[createOrganization] Stripe customer creation failed:", err);
    }
  }

  return { success: true };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getOrganization(clerkOrgId: string): Promise<Organization | null> {
  const collection = await getOrganizationsCollection();
  return collection.findOne({ clerkOrgId });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

type OrgSettingsInput = Partial<Pick<Organization,
  "name" | "slug" | "timezone" | "publicPageEnabled" | "emailFromName" | "emailFromAddress"
>>;

export async function updateOrganizationSettings(
  settings: OrgSettingsInput
): Promise<{ success: boolean; error?: string }> {
  const { orgId } = await requireRole("org:admin");

  const collection = await getOrganizationsCollection();
  const existing = await collection.findOne({ clerkOrgId: orgId });

  if (!existing) {
    return { success: false, error: "Organization not found." };
  }

  // Block mutating settings while subscription is in a degraded state
  if (existing.subscriptionStatus === "past_due" || existing.subscriptionStatus === "canceled") {
    return {
      success: false,
      error: `Settings changes are locked while your subscription is ${existing.subscriptionStatus}. Please resolve your billing first.`,
    };
  }

  // If slug is changing, invalidate both old and new slug from cache
  if (settings.slug && settings.slug !== existing.slug) {
    invalidateOrgCache(existing.slug);
    invalidateOrgCache(settings.slug);
  }

  await collection.updateOne(
    { clerkOrgId: orgId },
    { $set: { ...settings, updatedAt: new Date() } }
  );

  return { success: true };
}

// ---------------------------------------------------------------------------
// Subscription status update (called from Stripe webhook — NOT a Server Action)
// ---------------------------------------------------------------------------

export async function updateSubscriptionStatus(
  stripeCustomerId: string,
  newStatus: SubscriptionStatus,
  newPlanName: PlanName,
  eventTimestamp: Date
): Promise<void> {
  const collection = await getOrganizationsCollection();

  await collection.updateOne(
    {
      stripeCustomerId,
      $or: [
        { statusUpdatedAt: { $exists: false } },
        { statusUpdatedAt: { $lt: eventTimestamp } },
      ],
    },
    {
      $set: {
        subscriptionStatus: newStatus,
        planName: newPlanName,
        maxRegistrantsPerDay: getPlanLimit(newPlanName),
        statusUpdatedAt: eventTimestamp,
        updatedAt: new Date(),
      },
    }
  );
}
