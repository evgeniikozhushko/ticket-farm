import { describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const signUpMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs", () => ({
  SignUp: signUpMock,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/org-setup", () => ({
  getAuthenticatedOrgHomePath: vi.fn(() => Promise.resolve("/dashboard/lottery")),
}));

describe("SignUpPage", () => {
  it("passes explicit onboarding redirects to Clerk signup", async () => {
    authMock.mockResolvedValue({ userId: null, orgId: null });
    const { default: SignUpPage } = await import("@/app/(auth)/sign-up/[[...sign-up]]/page");

    const page = await SignUpPage();
    const signUpElement = page.props.children;

    expect(signUpElement.type).toBe(signUpMock);
    expect(signUpElement.props).toEqual({
      forceRedirectUrl: "/onboarding",
      fallbackRedirectUrl: "/onboarding",
      signInUrl: "/sign-in",
    });
  });
});
