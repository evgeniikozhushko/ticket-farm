import type { CSSProperties, ReactNode } from "react";
import { auth } from "@clerk/nextjs/server";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getOrganization } from "@/lib/orgs";

const dashboardShellStyle = {
  "--sidebar-width": "calc(var(--spacing) * 72)",
  "--header-height": "calc(var(--spacing) * 16)",
} as CSSProperties;

type DashboardShellProps = {
  title: string;
  children: ReactNode;
};

export async function DashboardShell({ title, children }: DashboardShellProps) {
  const { orgId, orgRole } = await auth();
  const org = orgId ? await getOrganization(orgId) : null;
  const publicSlug = org?.publicPageEnabled ? org.slug : null;

  return (
    <SidebarProvider style={dashboardShellStyle}>
      <AppSidebar variant="inset" isAdmin={orgRole === "org:admin"} publicSlug={publicSlug} />
      <SidebarInset>
        <SiteHeader title={title} />
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
