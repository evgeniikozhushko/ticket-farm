import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const authMock = vi.hoisted(() => vi.fn());
const getOrganizationMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn());
vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ usePathname: usePathnameMock }));
vi.mock("@/lib/orgs", () => ({ getOrganization: getOrganizationMock }));
vi.mock("@/components/nav-user", () => ({ NavUser: () => null }));

function renderSidebar(isAdmin: boolean, publicSlug?: string) {
  return renderToStaticMarkup(
    <SidebarProvider>
      <AppSidebar isAdmin={isAdmin} publicSlug={publicSlug} />
    </SidebarProvider>,
  );
}

function getLink(html: string, href: string) {
  return html.match(/<a [^>]*>/g)?.find((tag) => tag.includes(`href="${href}"`));
}

it.each([
  [false, false],
  [true, true],
])("shows admin navigation only when isAdmin is %s", (isAdmin, hasAdminLinks) => {
  const html = renderSidebar(isAdmin);

  expect(html).toContain("Lottery");
  expect(html).toContain("Participants");
  expect(html.includes("Settings")).toBe(hasAdminLinks);
  expect(html.includes("Billing")).toBe(hasAdminLinks);
});

it.each([
  { role: "org:member", enabled: true, hasAdminLinks: false },
  { role: "org:member", enabled: false, hasAdminLinks: false },
  { role: "org:admin", enabled: true, hasAdminLinks: true },
  { role: "org:admin", enabled: false, hasAdminLinks: true },
])("shows permitted links for $role with public page enabled=$enabled", async ({ role, enabled, hasAdminLinks }) => {
  authMock.mockResolvedValue({ orgId: "org_1", orgRole: role });
  getOrganizationMock.mockResolvedValue({ slug: "org-demo", publicPageEnabled: enabled });
  const { DashboardShell } = await import("@/components/dashboard-shell");
  const html = renderToStaticMarkup(await DashboardShell({ title: "Lottery", children: <p>Content</p> }));

  expect(getOrganizationMock).toHaveBeenCalledWith("org_1");
  expect(html.includes("Settings")).toBe(hasAdminLinks);
  expect(html.includes("Billing")).toBe(hasAdminLinks);
  expect(html).toContain("Content");
  if (enabled) {
    expect(html).toContain("Public page");
    const publicLink = getLink(html, "/org-demo");
    expect(publicLink).toContain('target="_blank"');
    expect(publicLink).toContain('rel="noopener noreferrer"');
  } else {
    expect(html).not.toContain("Public page");
    expect(getLink(html, "/org-demo")).toBeUndefined();
  }
});

it.each(["org_1", null])("omits the public link when the organization document is missing for %s", async (orgId) => {
  authMock.mockResolvedValue({ orgId, orgRole: "org:member" });
  getOrganizationMock.mockResolvedValue(null);
  const { DashboardShell } = await import("@/components/dashboard-shell");
  const html = renderToStaticMarkup(await DashboardShell({ title: "Lottery", children: <p>Content</p> }));

  expect(html).not.toContain("Public page");
  expect(getOrganizationMock).toHaveBeenCalledTimes(orgId ? 1 : 0);
});

it.each(["/dashboard/lottery", "/dashboard/participants", "/org/settings", "/billing"])(
  "marks only %s as the current page",
  (pathname) => {
    usePathnameMock.mockReturnValue(pathname);
    const html = renderSidebar(true, "org-demo");

    expect(getLink(html, pathname)).toContain('data-active="true"');
    expect(getLink(html, pathname)).toContain('aria-current="page"');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/data-active="true"/g)).toHaveLength(1);
  },
);

it.each(["/dashboard/participants", "/org/settings"])("highlights a parent link at %s", (href) => {
  usePathnameMock.mockReturnValue(`${href}/history`);
  const html = renderSidebar(true);

  expect(getLink(html, href)).toContain('data-active="true"');
  expect(html).not.toContain('aria-current="page"');
});

it.each(["/org-demo", "/dashboard/participants-extra", "#"])("keeps links inactive at %s", (pathname) => {
  usePathnameMock.mockReturnValue(pathname);
  const html = renderSidebar(true, "org-demo");

  expect(html).not.toContain('data-active="true"');
  expect(html).not.toContain('aria-current="page"');
});
