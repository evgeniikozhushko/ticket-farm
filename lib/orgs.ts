import { getOrganizationsCollection } from "@/lib/mongodb";
import { getPlanLimit } from "@/lib/plan-limits";
import type { Organization, PlanName, SubscriptionStatus } from "@/lib/types";

export async function getOrganization(
  clerkOrgId: string
): Promise<Organization | null> {
  const collection = await getOrganizationsCollection();
  return collection.findOne({ clerkOrgId });
}

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
