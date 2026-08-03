import { beforeEach, describe, expect, it, vi } from "vitest";

const protectMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  createRouteMatcher: (patterns: string[]) => {
    const prefixes = patterns.map((pattern) => pattern.replace("(.*)", ""));
    return (req: { url: string }) => {
      const pathname = new URL(req.url).pathname;
      return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
    };
  },
  clerkMiddleware: (handler: (auth: { protect: typeof protectMock }, req: { url: string }) => unknown) => {
    return (req: { url: string }) => handler({ protect: protectMock }, req);
  },
}));

describe("middleware", () => {
  beforeEach(() => {
    protectMock.mockReset();
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
