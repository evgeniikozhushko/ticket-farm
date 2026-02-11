"use server";

import { getOrganizationsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
import { invalidateOrgCache } from "@/lib/org-cache";
import type { Organization, PlanName, SubscriptionStatus } from "@/lib/types";

const PLAN_LIMITS: Record<PlanName, number> = {
  free:    100,
  starter: 500,
  growth:  2000,
  scale:   Infinity,
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOrganization(input: {
  clerkOrgId: string;
  name: string;
  slug: string;
  timezone: string;
}): Promise<Organization> {
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
    maxRegistrantsPerDay: PLAN_LIMITS.free,
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(org);
  return org as Organization;
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

  // If slug is changing, invalidate the old slug from cache
  if (settings.slug) {
    const existing = await collection.findOne({ clerkOrgId: orgId });
    if (existing && existing.slug !== settings.slug) {
      invalidateOrgCache(existing.slug);
      invalidateOrgCache(settings.slug);
    }
  }

  await collection.updateOne(
    { clerkOrgId: orgId },
    { $set: { ...settings, updatedAt: new Date() } }
  );

  return { success: true };
}

// ---------------------------------------------------------------------------
// Plan limit helper (used by registration)
// ---------------------------------------------------------------------------

export function getPlanLimit(planName: PlanName): number {
  return PLAN_LIMITS[planName];
}

// ---------------------------------------------------------------------------
// Subscription status update (called from Stripe webhook, NOT a server action)
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
        maxRegistrantsPerDay: PLAN_LIMITS[newPlanName],
        statusUpdatedAt: eventTimestamp,
        updatedAt: new Date(),
      },
    }
  );
}
