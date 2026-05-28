import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { OrgSettingsForm } from "@/components/org-settings-form";
import { getOrganization } from "@/lib/actions/org.actions";
import type { SerializedOrganization } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");
  if (orgRole !== "org:admin") redirect("/dashboard/lottery");

  const org = await getOrganization(orgId);
  if (!org) redirect("/onboarding");

  // Serialize for RSC boundary (Date → string)
  const serializedOrg: SerializedOrganization = {
    ...org,
    _id: org._id?.toString(),
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
    statusUpdatedAt: org.statusUpdatedAt?.toISOString(),
  };

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 16)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Organization Settings" />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
            <div>
              <h2 className="text-lg font-semibold">Organization settings</h2>
              <p className="text-sm text-muted-foreground">
                Update your organization name, slug, timezone, and email
                branding.
              </p>
            </div>

            <OrgSettingsForm org={serializedOrg} />

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
      </SidebarInset>
    </SidebarProvider>
  );
}
