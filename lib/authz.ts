import { auth } from "@clerk/nextjs/server";
import type { Organization } from "@/lib/types";

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

export async function requirePlatformAdmin(): Promise<{ userId: string }> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized: not authenticated");
  }

  const allowlist = (process.env.PLATFORM_ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (!allowlist.includes(userId)) {
    throw new Error("Forbidden: platform admin required");
  }

  return { userId };
}

/**
 * Throws if the organization's subscription is in a degraded state that
 * blocks write operations (past_due or canceled).
 *
 * Billing portal access is intentionally NOT gated here — it must remain
 * accessible so admins can resolve payment issues.
 */
export function requireActiveSub(org: Organization): void {
  if (org.subscriptionStatus === "past_due") {
    throw new Error(
      "Your subscription has a past-due payment. Please update your billing to continue."
    );
  }
  if (org.subscriptionStatus === "canceled") {
    throw new Error(
      "Your subscription has been canceled. Please re-subscribe to access this feature."
    );
  }
}
