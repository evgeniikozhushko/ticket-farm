import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/components/nav-user", () => ({ NavUser: () => null }));

it.each([
  [false, false],
  [true, true],
])("shows admin navigation only when isAdmin is %s", (isAdmin, hasAdminLinks) => {
  const html = renderToStaticMarkup(
    <SidebarProvider>
      <AppSidebar isAdmin={isAdmin} />
    </SidebarProvider>,
  );

  expect(html).toContain("Lottery");
  expect(html).toContain("Participants");
  expect(html.includes("Settings")).toBe(hasAdminLinks);
  expect(html.includes("Billing")).toBe(hasAdminLinks);
});

it.each([
  ["org:member", false],
  ["org:admin", true],
])("passes %s permissions from the session to navigation", async (role, hasAdminLinks) => {
  authMock.mockResolvedValue({ orgRole: role });
  const { DashboardShell } = await import("@/components/dashboard-shell");
  const html = renderToStaticMarkup(await DashboardShell({ title: "Lottery", children: <p>Content</p> }));

  expect(html.includes("Settings")).toBe(hasAdminLinks);
  expect(html.includes("Billing")).toBe(hasAdminLinks);
  expect(html).toContain("Content");
});
