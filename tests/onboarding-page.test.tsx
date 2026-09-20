import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const ensureOrganizationDocumentMock = vi.hoisted(() => vi.fn());
const redirectMock = vi.hoisted(() => vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }));

vi.mock("@/lib/org-setup", () => ({ ensureOrganizationDocument: ensureOrganizationDocumentMock }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@clerk/nextjs", () => ({ CreateOrganization: () => null }));
vi.mock("@/components/onboarding-form", () => ({ OnboardingForm: () => <p>Setup form</p> }));

it("tells unprovisioned members that an admin must complete setup", async () => {
  ensureOrganizationDocumentMock.mockResolvedValue({ status: "needs-admin" });
  const { default: OnboardingPage } = await import("@/app/(dashboard)/onboarding/page");
  const html = renderToStaticMarkup(await OnboardingPage());

  expect(html).toContain("An organization admin must complete setup");
  expect(html).not.toContain("Setup form");
});

it("redirects provisioned members to the dashboard", async () => {
  ensureOrganizationDocumentMock.mockResolvedValue({ status: "ok" });
  const { default: OnboardingPage } = await import("@/app/(dashboard)/onboarding/page");

  await expect(OnboardingPage()).rejects.toThrow("REDIRECT:/dashboard/lottery");
});
