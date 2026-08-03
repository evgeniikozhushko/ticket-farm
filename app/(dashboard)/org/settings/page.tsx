import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard-shell";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { getOrganization } from "@/lib/orgs";
import { DEFAULT_PICKUP_TIME } from "@/lib/pickup";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");
  if (orgRole !== "org:admin") redirect("/dashboard/lottery");

  const org = await getOrganization(orgId);
  if (!org) redirect("/onboarding");

  const orgSettings = {
    name: org.name,
    slug: org.slug,
    timezone: org.timezone,
    publicPageEnabled: org.publicPageEnabled,
    emailFromName: org.emailFromName,
    emailFromAddress: org.emailFromAddress,
    pickupTime: org.pickupTime ?? DEFAULT_PICKUP_TIME,
    pickupLocation: org.pickupLocation ?? "",
  };

  return (
    <DashboardShell title="Organization Settings">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div>
              <h2 className="text-lg font-semibold">Organization settings</h2>
              <p className="text-sm text-muted-foreground">
                Update your organization name, slug, timezone, pickup details,
                and email branding.
              </p>
            </div>

            <OrgSettingsForm org={orgSettings} />

            {/* Plan info */}
            <div className="max-w-lg rounded-lg border p-4 text-sm">
              <p className="font-medium">Current plan</p>
              <p className="mt-1 text-muted-foreground capitalize">
                {org.planName} — up to{" "}
                {org.maxRegistrantsPerDay === null
                  ? "unlimited"
                  : org.maxRegistrantsPerDay}{" "}
                registrants/day
              </p>
              <p className="mt-1 text-muted-foreground">
                Status:{" "}
                <span className="capitalize">{org.subscriptionStatus}</span>
              </p>
            </div>
        </div>
      </div>
    </DashboardShell>
  );
}
