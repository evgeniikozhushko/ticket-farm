import { auth } from "@clerk/nextjs/server";

type OrgRole = "org:admin" | "org:member";

/**
 * Asserts the current request has an authenticated user with at least
 * the specified organization role. Throws if the check fails.
 *
 * Role hierarchy: org:admin > org:member
 *
 * Usage in Server Actions:
 *   await requireRole("org:admin");   // only admins
 *   await requireRole("org:member");  // admins and members
 */
export async function requireRole(minRole: OrgRole): Promise<{ userId: string; orgId: string; orgRole: string }> {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) {
    throw new Error("Unauthorized: not authenticated");
  }

  if (!orgId || !orgRole) {
    throw new Error("Unauthorized: no organization context");
  }

  // Role hierarchy check: org:admin satisfies org:member requirement
  if (minRole === "org:admin" && orgRole !== "org:admin") {
    throw new Error("Forbidden: admin role required");
  }

  return { userId, orgId, orgRole };
}
