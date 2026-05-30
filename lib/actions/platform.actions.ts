"use server";

import {
  getOrganizationsCollection,
  getRegistrantsCollection,
  getTicketsCollection,
} from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { requirePlatformAdmin } from "@/lib/authz";
import type { PlanName, SubscriptionStatus } from "@/lib/types";

export type PlatformOrgDirectoryRow = {
  orgId: string;
  name: string;
  slug: string;
  publicPageUrl: string;
  publicPageEnabled: boolean;
  planName: PlanName;
  subscriptionStatus: SubscriptionStatus;
  createdAt: Date;
  todaysRegistrants: number;
  totalRegistrants: number;
  totalTickets: number;
  lastActivityAt?: Date;
};

function latestDate(...dates: Array<Date | undefined>): Date | undefined {
  const timestamps = dates
    .filter((date): date is Date => date instanceof Date)
    .map((date) => date.getTime());

  if (timestamps.length === 0) return undefined;
  return new Date(Math.max(...timestamps));
}

export async function listOrgDirectory(): Promise<PlatformOrgDirectoryRow[]> {
  await requirePlatformAdmin();

  const organizationsCollection = await getOrganizationsCollection();
  const registrantsCollection = await getRegistrantsCollection();
  const ticketsCollection = await getTicketsCollection();

  const orgs = await organizationsCollection.find({}).sort({ createdAt: -1 }).toArray();

  return Promise.all(
    orgs.map(async (org) => {
      const today = getTodayDateString(org.timezone);
      const [
        todaysRegistrants,
        totalRegistrants,
        totalTickets,
        latestRegistrant,
        latestTicket,
      ] = await Promise.all([
        registrantsCollection.countDocuments({ orgId: org.clerkOrgId, date: today }),
        registrantsCollection.countDocuments({ orgId: org.clerkOrgId }),
        ticketsCollection.countDocuments({ orgId: org.clerkOrgId }),
        registrantsCollection.find({ orgId: org.clerkOrgId }).sort({ enteredAt: -1 }).limit(1).toArray(),
        ticketsCollection.find({ orgId: org.clerkOrgId }).sort({ generatedAt: -1 }).limit(1).toArray(),
      ]);

      return {
        orgId: org.clerkOrgId,
        name: org.name,
        slug: org.slug,
        publicPageUrl: `/${org.slug}`,
        publicPageEnabled: org.publicPageEnabled,
        planName: org.planName,
        subscriptionStatus: org.subscriptionStatus,
        createdAt: org.createdAt,
        todaysRegistrants,
        totalRegistrants,
        totalTickets,
        lastActivityAt: latestDate(
          org.updatedAt,
          latestRegistrant[0]?.enteredAt,
          latestTicket[0]?.generatedAt
        ),
      };
    })
  );
}
