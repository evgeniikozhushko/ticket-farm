import { beforeEach, describe, expect, it, vi } from "vitest";

const requirePlatformAdminMock = vi.hoisted(() => vi.fn());
const organizationsCollection = vi.hoisted(() => ({
  find: vi.fn(),
}));
const registrantsCollection = vi.hoisted(() => ({
  countDocuments: vi.fn(),
  find: vi.fn(),
}));
const ticketsCollection = vi.hoisted(() => ({
  countDocuments: vi.fn(),
  find: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  requirePlatformAdmin: requirePlatformAdminMock,
}));

vi.mock("@/lib/date", () => ({
  getTodayDateString: vi.fn(() => "2026-05-29"),
}));

vi.mock("@/lib/mongodb", () => ({
  getOrganizationsCollection: vi.fn(() => Promise.resolve(organizationsCollection)),
  getRegistrantsCollection: vi.fn(() => Promise.resolve(registrantsCollection)),
  getTicketsCollection: vi.fn(() => Promise.resolve(ticketsCollection)),
}));

function chainToArray<T>(items: T[]) {
  return {
    sort: vi.fn(() => ({
      limit: vi.fn(() => ({
        toArray: vi.fn(() => Promise.resolve(items)),
      })),
      toArray: vi.fn(() => Promise.resolve(items)),
    })),
  };
}

async function loadAction() {
  vi.resetModules();
  return import("@/lib/actions/platform.actions");
}

describe("platform org directory", () => {
  beforeEach(() => {
    requirePlatformAdminMock.mockReset();
    organizationsCollection.find.mockReset();
    registrantsCollection.countDocuments.mockReset();
    registrantsCollection.find.mockReset();
    ticketsCollection.countDocuments.mockReset();
    ticketsCollection.find.mockReset();

    requirePlatformAdminMock.mockResolvedValue({ userId: "user_platform" });
    organizationsCollection.find.mockReturnValue(
      chainToArray([
        {
          clerkOrgId: "org_a",
          name: "Org A",
          slug: "org-a",
          timezone: "America/Edmonton",
          publicPageEnabled: true,
          planName: "free",
          subscriptionStatus: "trialing",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-02T00:00:00Z"),
        },
        {
          clerkOrgId: "org_b",
          name: "Org B",
          slug: "org-b",
          timezone: "America/Edmonton",
          publicPageEnabled: false,
          planName: "growth",
          subscriptionStatus: "active",
          createdAt: new Date("2026-02-01T00:00:00Z"),
          updatedAt: new Date("2026-02-02T00:00:00Z"),
        },
      ])
    );
    registrantsCollection.countDocuments.mockResolvedValue(3);
    ticketsCollection.countDocuments.mockResolvedValue(2);
    registrantsCollection.find.mockReturnValue(
      chainToArray([{ enteredAt: new Date("2026-05-29T12:00:00Z") }])
    );
    ticketsCollection.find.mockReturnValue(
      chainToArray([{ generatedAt: new Date("2026-05-29T13:00:00Z") }])
    );
  });

  it("denies non-allowlisted users before querying organizations", async () => {
    requirePlatformAdminMock.mockRejectedValue(new Error("Forbidden: platform admin required"));
    const { listOrgDirectory } = await loadAction();

    await expect(listOrgDirectory()).rejects.toThrow("platform admin required");
    expect(organizationsCollection.find).not.toHaveBeenCalled();
  });

  it("returns orgs across tenants with unscoped organization lookup and per-org metrics", async () => {
    const { listOrgDirectory } = await loadAction();

    const rows = await listOrgDirectory();

    expect(organizationsCollection.find).toHaveBeenCalledWith({});
    expect(rows.map((row) => row.orgId)).toEqual(["org_a", "org_b"]);
    expect(registrantsCollection.countDocuments).toHaveBeenCalledWith({
      orgId: "org_a",
      date: "2026-05-29",
    });
    expect(registrantsCollection.countDocuments).toHaveBeenCalledWith({
      orgId: "org_b",
      date: "2026-05-29",
    });
    expect(ticketsCollection.countDocuments).toHaveBeenCalledWith({ orgId: "org_a" });
    expect(ticketsCollection.countDocuments).toHaveBeenCalledWith({ orgId: "org_b" });
  });
});
