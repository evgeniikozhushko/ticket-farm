import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createOrganization } from "@/lib/actions/org.actions";
import { normalizeOrgSlug } from "@/lib/slugs";

export async function hasOrganizationDocument(clerkOrgId: string): Promise<boolean> {
  const { getOrganizationsCollection } = await import("@/lib/mongodb");
  const collection = await getOrganizationsCollection();
  const org = await collection.findOne(
    { clerkOrgId },
    { projection: { _id: 1 } }
  );

  return Boolean(org);
}

export async function getAuthenticatedOrgHomePath(orgId: string | null | undefined): Promise<string> {
  if (!orgId) {
    return "/onboarding";
  }

  return (await hasOrganizationDocument(orgId)) ? "/dashboard/lottery" : "/onboarding";
}

export async function requireOrganizationDocument(): Promise<{
  userId: string;
  orgId: string;
  orgRole: string | null | undefined;
}> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (!orgId) {
    redirect("/onboarding");
  }

  if (!(await hasOrganizationDocument(orgId))) {
    redirect("/onboarding");
  }

  return { userId, orgId, orgRole };
}

export type EnsureOrganizationResult =
  | { status: "ok" }
  | { status: "needs-clerk-org" }
  | { status: "needs-form"; defaultSlug: string; error: string };

export async function ensureOrganizationDocument(): Promise<EnsureOrganizationResult> {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/sign-in");
  }

  if (!orgId) {
    return { status: "needs-clerk-org" };
  }

  if (await hasOrganizationDocument(orgId)) {
    return { status: "ok" };
  }

  let clerkOrg;
  try {
    const client = await clerkClient();
    clerkOrg = await client.organizations.getOrganization({ organizationId: orgId });
  } catch (err) {
    console.error("[ensureOrganizationDocument] Clerk org fetch failed", { orgId, err });
    return { status: "needs-clerk-org" };
  }

  const fallbackSlug = clerkOrg.slug || normalizeOrgSlug(clerkOrg.name);

  const result = await createOrganization({
    name: clerkOrg.name,
    slug: fallbackSlug,
    timezone: "America/Edmonton",
  });

  if (result.success) {
    return { status: "ok" };
  }

  return { status: "needs-form", defaultSlug: fallbackSlug, error: result.error };
}
