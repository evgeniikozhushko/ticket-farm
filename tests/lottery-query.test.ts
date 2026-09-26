import { ObjectId } from "mongodb";
import { beforeEach, expect, it, vi } from "vitest";

const registrantRows = vi.hoisted(() => vi.fn());
const ticketRows = vi.hoisted(() => vi.fn());
const lottery = vi.hoisted(() => vi.fn());
vi.mock("@/lib/authz", () => ({ requireRole: async () => ({ orgId: "org_1" }) }));
vi.mock("@/lib/orgs", () => ({ getOrganization: async () => ({ timezone: "America/Edmonton" }) }));
vi.mock("@/lib/date", () => ({ getTodayDateString: () => "2026-09-20" }));
vi.mock("@/lib/mongodb", () => ({
  getRegistrantsCollection: async () => ({
    find: () => ({
      toArray: registrantRows,
      sort: () => ({ limit: () => ({ toArray: registrantRows }) }),
    }),
  }),
  getTicketsCollection: async () => ({
    find: () => ({ sort: () => ({ toArray: ticketRows }) }),
  }),
  getLotteriesCollection: async () => ({ findOne: lottery }),
}));

import { getTodayRegistrants, getTodayWinners } from "@/lib/actions/lottery-query.actions";

beforeEach(() => {
  registrantRows.mockReset().mockResolvedValue([]);
  ticketRows.mockReset().mockResolvedValue([]);
  lottery.mockReset().mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("distinguishes a failed registrant cursor from a successful empty query", async () => {
  expect(await getTodayRegistrants()).toEqual([]);
  registrantRows.mockRejectedValueOnce(new Error("Cursor unavailable"));
  expect(await getTodayRegistrants()).toBeNull();
});

it("returns an empty winner list when no draw exists", async () => {
  expect(await getTodayWinners()).toEqual([]);
});

it.each(["lottery", "registrants", "tickets"])("reports unavailable when the winner %s query fails", async (query) => {
  lottery.mockResolvedValue({ status: "LOTTERY_DRAWN", winnerRegistrantIds: [new ObjectId()] });
  const failingQuery = query === "lottery" ? lottery : query === "registrants" ? registrantRows : ticketRows;
  failingQuery.mockRejectedValueOnce(new Error("Database unavailable"));
  expect(await getTodayWinners()).toBeNull();
});
