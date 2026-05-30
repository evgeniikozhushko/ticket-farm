import { beforeEach, describe, expect, it, vi } from "vitest";

const requireRoleMock = vi.hoisted(() => vi.fn());
const registrantsCollection = vi.hoisted(() => ({
  find: vi.fn(),
}));
const ticketsCollection = vi.hoisted(() => ({
  find: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  requireRole: requireRoleMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getRegistrantsCollection: vi.fn(() => Promise.resolve(registrantsCollection)),
  getTicketsCollection: vi.fn(() => Promise.resolve(ticketsCollection)),
}));

const registrants = [
  {
    orgId: "org_1",
    name: "Ada",
    email: "ada@example.com",
    date: "2026-05-28",
    enteredAt: new Date("2026-05-28T10:00:00Z"),
  },
  {
    orgId: "org_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    date: "2026-05-29",
    enteredAt: new Date("2026-05-29T10:00:00Z"),
  },
  {
    orgId: "org_2",
    name: "Other Ada",
    email: "ada@example.com",
    date: "2026-05-29",
    enteredAt: new Date("2026-05-29T11:00:00Z"),
  },
];

const tickets = [
  {
    orgId: "org_1",
    name: "Ada Lovelace",
    email: "ada@example.com",
    date: "2026-05-29",
    ticketNumber: 7,
    ticketId: "123456",
    pickupTime: "4pm",
    status: "ACTIVE",
    generatedAt: new Date("2026-05-29T12:00:00Z"),
    emailSent: true,
  },
  {
    orgId: "org_2",
    name: "Other Ada",
    email: "ada@example.com",
    date: "2026-05-29",
    ticketNumber: 1,
    ticketId: "999999",
    pickupTime: "4pm",
    status: "CHECKED_IN",
    generatedAt: new Date("2026-05-29T12:00:00Z"),
  },
];

function chainToArray<T>(items: T[]) {
  return {
    sort: vi.fn(() => ({
      toArray: vi.fn(() => Promise.resolve(items)),
    })),
    toArray: vi.fn(() => Promise.resolve(items)),
  };
}

async function loadAction() {
  vi.resetModules();
  return import("@/lib/actions/participants.actions");
}

describe("participants actions", () => {
  beforeEach(() => {
    requireRoleMock.mockReset();
    registrantsCollection.find.mockReset();
    ticketsCollection.find.mockReset();

    requireRoleMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: "org:member" });
    registrantsCollection.find.mockImplementation((query: { orgId: string; email?: string }) => {
      const rows = registrants.filter(
        (registrant) =>
          registrant.orgId === query.orgId &&
          (!query.email || registrant.email === query.email)
      );
      return chainToArray(rows);
    });
    ticketsCollection.find.mockImplementation((query: { orgId: string; email?: string }) => {
      const rows = tickets.filter(
        (ticket) =>
          ticket.orgId === query.orgId &&
          (!query.email || ticket.email === query.email)
      );
      return chainToArray(rows);
    });
  });

  it("groups participant summaries by email within the active org only", async () => {
    const { listOrgParticipants } = await loadAction();

    const rows = await listOrgParticipants({ limit: 20 });

    expect(registrantsCollection.find).toHaveBeenCalledWith({ orgId: "org_1" });
    expect(ticketsCollection.find).toHaveBeenCalledWith({ orgId: "org_1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      orgId: "org_1",
      email: "ada@example.com",
      latestName: "Ada Lovelace",
      entryCount: 2,
      winCount: 1,
      activeTicketCount: 1,
      checkedInTicketCount: 0,
    });
  });

  it("returns participant history scoped by normalized email and active org", async () => {
    const { getParticipantHistory } = await loadAction();

    const history = await getParticipantHistory(" ADA@example.com ");

    expect(registrantsCollection.find).toHaveBeenCalledWith({
      orgId: "org_1",
      email: "ada@example.com",
    });
    expect(ticketsCollection.find).toHaveBeenCalledWith({
      orgId: "org_1",
      email: "ada@example.com",
    });
    expect(history).toEqual([
      {
        date: "2026-05-28",
        enteredAt: new Date("2026-05-28T10:00:00Z"),
        won: false,
        ticketNumber: undefined,
        ticketId: undefined,
        ticketStatus: undefined,
        emailSent: undefined,
        emailError: undefined,
      },
      {
        date: "2026-05-29",
        enteredAt: new Date("2026-05-29T10:00:00Z"),
        won: true,
        ticketNumber: 7,
        ticketId: "123456",
        ticketStatus: "ACTIVE",
        emailSent: true,
        emailError: undefined,
      },
    ]);
  });
});
