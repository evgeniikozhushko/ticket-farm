import { beforeEach, describe, expect, it, vi } from "vitest";

const admin = vi.hoisted(() => vi.fn());
const organizations = vi.hoisted(() => ({ find: vi.fn() }));
const registrants = vi.hoisted(() => ({ aggregate: vi.fn() }));
const tickets = vi.hoisted(() => ({ aggregate: vi.fn() }));
vi.mock("@/lib/authz", () => ({ requirePlatformAdmin: admin }));
vi.mock("@/lib/date", () => ({ getTodayDateString: vi.fn((timezone: string) => timezone === "America/Edmonton" ? "2026-05-29" : "2026-05-30") }));
vi.mock("@/lib/mongodb", () => ({ getOrganizationsCollection: async () => organizations, getRegistrantsCollection: async () => registrants, getTicketsCollection: async () => tickets }));

function orgCursor(rows: unknown[]) { return { sort: vi.fn(() => ({ limit: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue(rows) })) })) }; }
function aggregate(rows: unknown[]) { return { toArray: vi.fn().mockResolvedValue(rows) }; }
async function load() { vi.resetModules(); return import("@/lib/actions/platform.actions"); }

describe("platform org directory", () => {
  beforeEach(() => {
    admin.mockResolvedValue({ userId: "platform" });
    organizations.find.mockReset(); registrants.aggregate.mockReset(); tickets.aggregate.mockReset();
    organizations.find.mockReturnValue(orgCursor([{ _id: { toString: () => "64b64c1f0000000000000001" }, clerkOrgId: "org_a", name: "Org A", slug: "org-a", timezone: "America/Edmonton", publicPageEnabled: true, planName: "free", subscriptionStatus: "trialing", createdAt: new Date("2026-01-01"), updatedAt: new Date("2026-01-02") }]));
    registrants.aggregate.mockReturnValue(aggregate([{ _id: "org_a", totalRegistrants: 3, todaysRegistrants: 2, lastRegistrantAt: new Date("2026-01-03") }]));
    tickets.aggregate.mockReturnValue(aggregate([{ _id: "org_a", totalTickets: 1, lastTicketAt: new Date("2026-01-04") }]));
  });
  it("authorizes before querying", async () => {
    admin.mockRejectedValue(new Error("Forbidden"));
    await expect((await load()).listOrgDirectory()).rejects.toThrow("Forbidden");
    expect(organizations.find).not.toHaveBeenCalled();
  });
  it("uses one bounded organization page and set-based metrics", async () => {
    const result = await (await load()).listOrgDirectory();
    expect(organizations.find).toHaveBeenCalledWith({});
    expect(organizations.find.mock.results[0].value.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    expect(registrants.aggregate).toHaveBeenCalledOnce();
    expect(tickets.aggregate).toHaveBeenCalledOnce();
    expect(registrants.aggregate.mock.calls[0][0][0]).toEqual({ $match: { orgId: { $in: ["org_a"] } } });
    expect(result.orgs[0]).toMatchObject({ orgId: "org_a", todaysRegistrants: 2, totalRegistrants: 3, totalTickets: 1, lastActivityAt: new Date("2026-01-04") });
  });
});
