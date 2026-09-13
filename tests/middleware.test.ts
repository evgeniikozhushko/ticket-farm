import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const protectMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", async (importOriginal) => {
  const { createRouteMatcher } = await importOriginal<typeof import("@clerk/nextjs/server")>();
  return {
    createRouteMatcher: (patterns: string[]) => {
      // Exercise Clerk's real path normalization; only authentication is mocked.
      const matches = createRouteMatcher(patterns);
      return (req: { url: string }) => matches(new NextRequest(req.url));
    },
    clerkMiddleware: (handler: (auth: { protect: typeof protectMock }, req: { url: string }) => unknown) => {
      return (req: { url: string }) => handler({ protect: protectMock }, req);
    },
  };
});

describe("middleware", () => {
  beforeEach(() => {
    protectMock.mockReset();
  });

  it.each([
    "/%64ashboard/lottery",
    "/dashboard//lottery",
    "/%6frg/settings",
    "/%62illing",
    "/%61dmin/registrants",
  ])("protects normalized organization route %s", async (pathname) => {
    protectMock.mockResolvedValue({ orgId: null });
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<Response>)({
      url: `https://ticketfarm.test${pathname}`,
    });

    expect(protectMock).toHaveBeenCalledOnce();
    expect(result.headers.get("location")).toBe("https://ticketfarm.test/onboarding");
  });

  it("protects an encoded platform route without requiring an organization", async () => {
    protectMock.mockResolvedValue({ orgId: null });
    const { default: middleware } = await import("@/proxy");

    await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/%70latform/orgs",
    });

    expect(protectMock).toHaveBeenCalledOnce();
  });

  it("allows public routes without auth protection", async () => {
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/public-org",
    });

    expect(result).toBeUndefined();
    expect(protectMock).not.toHaveBeenCalled();
  });

  it("allows root without auth protection", async () => {
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/",
    });

    expect(result).toBeUndefined();
    expect(protectMock).not.toHaveBeenCalled();
  });

  it("redirects authenticated users without orgId from org-required routes to onboarding", async () => {
    protectMock.mockResolvedValue({ orgId: null });
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/dashboard",
    });

    expect(protectMock).toHaveBeenCalledOnce();
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(307);
    expect((result as Response).headers.get("location")).toBe("https://ticketfarm.test/onboarding");
  });

  it("protects onboarding so signed-out users cannot fall through to public org routing", async () => {
    protectMock.mockResolvedValue({ orgId: null });
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/onboarding",
    });

    expect(protectMock).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });

  it("protects platform routes without requiring org context", async () => {
    protectMock.mockResolvedValue({ orgId: null });
    const { default: middleware } = await import("@/proxy");

    const result = await (middleware as unknown as (req: { url: string }) => Promise<unknown>)({
      url: "https://ticketfarm.test/platform/orgs",
    });

    expect(protectMock).toHaveBeenCalledOnce();
    expect(result).toBeUndefined();
  });
});
