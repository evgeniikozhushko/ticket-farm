"use server";

import { auth } from "@clerk/nextjs/server";
import { getOrganizationsCollection } from "@/lib/mongodb";
import { requireRole } from "@/lib/authz";
import { invalidateOrgCache } from "@/lib/org-cache";
import { getPlanLimit } from "@/lib/plan-limits";
import { parseOrgSlug } from "@/lib/slugs";
import { getOrCreateStripeCustomer } from "@/lib/stripe";
import type { Organization, PlanName, SubscriptionStatus } from "@/lib/types";
import { z } from "zod";

// Re-export for consumers that only need the helper
export { getPlanLimit };

const slugSchema = z.string().transform((value, ctx) => {
  try {
    return parseOrgSlug(value);
  } catch (err) {
    ctx.addIssue({
      code: "custom",
      message: err instanceof Error ? err.message : "Invalid slug.",
    });
    return z.NEVER;
  }
});

function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const timezoneSchema = z.string().trim().min(1).refine(isValidTimezone, {
  message: "Invalid timezone.",
});

const createOrganizationSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: slugSchema,
    timezone: timezoneSchema,
  });

export async function createOrganization(
  input: unknown
): Promise<{ success: true } | { success: false; error: string }> {
  const { userId, orgId } = await auth();

  if (!userId || !orgId) {
    return { success: false, error: "You must be signed in to an organization first." };
  }

  const parsed = createOrganizationSchema.safeParse(input);

  if (!parsed.success) {
    return { success: false, error: "Invalid organization details." };
  }

  const collection = await getOrganizationsCollection();
  const existing = await collection.findOne({ clerkOrgId: orgId });

  if (existing) {
    return { success: true };
  }

  const now = new Date();
  const org: Omit<Organization, "_id"> = {
    clerkOrgId: orgId,
    name: parsed.data.name,
    slug: parsed.data.slug,
    timezone: parsed.data.timezone,
    publicPageEnabled: true,
    emailFromName: parsed.data.name,
    emailFromAddress: "hello@ticketfarm.ca",
    subscriptionStatus: "trialing",
    planName: "free",
    maxRegistrantsPerDay: getPlanLimit("free"),
    createdAt: now,
    updatedAt: now,
  };

  try {
    await collection.insertOne(org);
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      if (getDuplicateKeyField(err) === "clerkOrgId") {
        return { success: true };
      }

      return { success: false, error: "This slug is already in use. Please choose another." };
    }

    throw err;
  }

  // Create a Stripe customer immediately so the billing flow is ready from day 1.
  // This is best-effort — a Stripe failure must not block org creation.
  if (process.env.STRIPE_SECRET_KEY) {
    try {
      await getOrCreateStripeCustomer(orgId, parsed.data.name);
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

const orgSettingsSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    slug: slugSchema.optional(),
    timezone: timezoneSchema.optional(),
    publicPageEnabled: z.boolean().optional(),
    emailFromName: z.string().trim().min(1).optional(),
    emailFromAddress: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  })
  .strict();

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(
    err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: unknown }).code === 11000
  );
}

function getDuplicateKeyField(err: unknown): string | undefined {
  if (!err || typeof err !== "object" || !("keyPattern" in err)) {
    return undefined;
  }

  const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
  return keyPattern ? Object.keys(keyPattern)[0] : undefined;
}

export async function updateOrganizationSettings(
  settings: unknown
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

  const parsed = orgSettingsSchema.safeParse(settings);

  if (!parsed.success) {
    return { success: false, error: "Invalid organization settings." };
  }

  try {
    await collection.updateOne(
      { clerkOrgId: orgId },
      { $set: { ...parsed.data, updatedAt: new Date() } }
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return { success: false, error: "This slug is already in use. Please choose another." };
    }

    throw err;
  }

  // If slug changed, invalidate both old and new slug from cache.
  if (parsed.data.slug && parsed.data.slug !== existing.slug) {
    invalidateOrgCache(existing.slug);
    invalidateOrgCache(parsed.data.slug);
  }

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
