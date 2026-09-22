"use server";

import { ObjectId } from "mongodb";
import { getOrganizationsCollection, getRegistrantsCollection, getTicketsCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";
import { requirePlatformAdmin } from "@/lib/authz";
import type { PlanName, SubscriptionStatus } from "@/lib/types";

const DIRECTORY_PAGE_SIZE = 50;
export type PlatformOrgDirectoryRow = { orgId: string; name: string; slug: string; publicPageUrl: string; publicPageEnabled: boolean; planName: PlanName; subscriptionStatus: SubscriptionStatus; createdAt: Date; todaysRegistrants: number; totalRegistrants: number; totalTickets: number; lastActivityAt?: Date };
export type PlatformOrgDirectoryResult = { orgs: PlatformOrgDirectoryRow[]; nextCursor?: string };
type Cursor = { createdAt: string; id: string };

function encodeCursor(org: { _id?: ObjectId; createdAt: Date }): string | undefined {
  return org._id ? Buffer.from(JSON.stringify({ createdAt: org.createdAt.toISOString(), id: org._id.toString() })).toString("base64url") : undefined;
}
function decodeCursor(value?: string): Cursor | null {
  if (!value) return null;
  try { const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8")); return typeof cursor.createdAt === "string" && ObjectId.isValid(cursor.id) ? cursor : null; } catch { return null; }
}
function latestDate(...dates: Array<Date | undefined>): Date | undefined {
  const values = dates.filter((date): date is Date => date instanceof Date).map((date) => date.getTime());
  return values.length ? new Date(Math.max(...values)) : undefined;
}

export async function listOrgDirectory(cursorValue?: string): Promise<PlatformOrgDirectoryResult> {
  await requirePlatformAdmin();
  const organizations = await getOrganizationsCollection();
  const registrants = await getRegistrantsCollection();
  const tickets = await getTicketsCollection();
  const cursor = decodeCursor(cursorValue);
  const orgRows = await organizations.find(cursor ? { $or: [
    { createdAt: { $lt: new Date(cursor.createdAt) } },
    { createdAt: new Date(cursor.createdAt), _id: { $lt: new ObjectId(cursor.id) } },
  ] } : {}).sort({ createdAt: -1, _id: -1 }).limit(DIRECTORY_PAGE_SIZE + 1).toArray();
  const page = orgRows.slice(0, DIRECTORY_PAGE_SIZE);
  const orgIds = page.map((org) => org.clerkOrgId);
  if (!orgIds.length) return { orgs: [] };
  const dateBuckets = new Map<string, string[]>();
  for (const org of page) {
    const date = getTodayDateString(org.timezone);
    dateBuckets.set(date, [...(dateBuckets.get(date) ?? []), org.clerkOrgId]);
  }
  const todayBranches = [...dateBuckets.entries()].map(([date, ids]) => ({ case: { $and: [{ $eq: ["$date", date] }, { $in: ["$orgId", ids] }] }, then: 1 }));
  const [registrantMetrics, ticketMetrics] = await Promise.all([
    registrants.aggregate<{ _id: string; totalRegistrants: number; todaysRegistrants: number; lastRegistrantAt?: Date }>([
      { $match: { orgId: { $in: orgIds } } },
      { $group: { _id: "$orgId", totalRegistrants: { $sum: 1 }, todaysRegistrants: { $sum: { $switch: { branches: todayBranches, default: 0 } } }, lastRegistrantAt: { $max: "$enteredAt" } } },
    ]).toArray(),
    tickets.aggregate<{ _id: string; totalTickets: number; lastTicketAt?: Date }>([
      { $match: { orgId: { $in: orgIds } } },
      { $group: { _id: "$orgId", totalTickets: { $sum: 1 }, lastTicketAt: { $max: "$generatedAt" } } },
    ]).toArray(),
  ]);
  const registrationByOrg = new Map(registrantMetrics.map((row) => [row._id, row]));
  const ticketsByOrg = new Map(ticketMetrics.map((row) => [row._id, row]));
  const orgs = page.map((org) => {
    const registration = registrationByOrg.get(org.clerkOrgId);
    const ticket = ticketsByOrg.get(org.clerkOrgId);
    return { orgId: org.clerkOrgId, name: org.name, slug: org.slug, publicPageUrl: `/${org.slug}`, publicPageEnabled: org.publicPageEnabled, planName: org.planName, subscriptionStatus: org.subscriptionStatus, createdAt: org.createdAt, todaysRegistrants: registration?.todaysRegistrants ?? 0, totalRegistrants: registration?.totalRegistrants ?? 0, totalTickets: ticket?.totalTickets ?? 0, lastActivityAt: latestDate(org.updatedAt, registration?.lastRegistrantAt, ticket?.lastTicketAt) };
  });
  return { orgs, ...(orgRows.length > DIRECTORY_PAGE_SIZE ? { nextCursor: encodeCursor(page.at(-1)!) } : {}) };
}
