import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const statsMock = vi.hoisted(() => vi.fn());
const registrantsMock = vi.hoisted(() => vi.fn());
const winnersMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), redirect: vi.fn() }));
vi.mock("@/lib/actions/lottery-query.actions", () => ({
  getTodayLotteryStats: statsMock,
  getTodayRegistrants: registrantsMock,
  getTodayWinners: winnersMock,
}));
vi.mock("@/lib/actions/lottery-draw.actions", () => ({
  drawTodayLottery: vi.fn(),
  retryTodayWinnerEmails: vi.fn(),
}));
vi.mock("@/lib/actions/ticket-redemption.actions", () => ({
  lookupTicketReference: vi.fn(),
  redeemTicketReference: vi.fn(),
}));
vi.mock("@/components/dashboard-shell", () => ({
  DashboardShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/lottery/lottery-stats-cards", () => ({
  LotteryStatsCards: ({ stats }: { stats: { totalRegistrants: number } }) => <p>Registrants: {stats.totalRegistrants}</p>,
}));
vi.mock("@/components/lottery/registrants-data-table", () => ({
  RegistrantsDataTable: ({ registrants }: { registrants: { name: string }[] }) => <p>{registrants.map((r) => r.name).join(", ")}</p>,
}));

describe("lottery dashboard permissions", () => {
  beforeEach(() => {
    authMock.mockReset();
    statsMock.mockReset().mockResolvedValue({
      totalRegistrants: 1,
      status: "LOTTERY_DRAWN",
      winnersDrawn: 1,
      lotteryDate: "2026-09-20",
      drawnAt: new Date("2026-09-20T18:00:00Z"),
      maxTicketsAvailable: 1,
    });
    registrantsMock.mockReset().mockResolvedValue([{
      orgId: "org_1", name: "Ada", email: "ada@example.com", date: "2026-09-20",
      _id: { toString: () => "registrant_1" }, enteredAt: new Date("2026-09-20T12:00:00Z"),
    }]);
    winnersMock.mockReset().mockResolvedValue([{
      _id: "registrant_1", name: "Ada", email: "ada@example.com",
      enteredAt: "2026-09-20T12:00:00Z", ticketNumber: 1,
      ticketId: "4ISW51HA9O0Z", emailSent: false,
    }]);
  });

  it.each([
    ["org:member", false],
    ["org:admin", true],
  ])("shows shared information and appropriate controls to %s", async (role, isAdmin) => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: role });
    const { default: LotteryPage } = await import("@/app/dashboard/lottery/page");
    const html = renderToStaticMarkup(await LotteryPage());

    expect(html).toContain("Registrants: 1");
    expect(html).toContain("Ada");
    expect(html).toContain("4ISW51HA9O0Z");
    expect(html).toContain("Ticket pickup");
    expect(html).toContain("Reference");
    expect(html).toContain("Find ticket");
    expect(html.includes("Retry unsent result emails")).toBe(isAdmin);
    expect(html.includes("Retry result emails for draw date")).toBe(isAdmin);
    expect(statsMock).toHaveBeenCalledOnce();
    expect(registrantsMock).toHaveBeenCalledOnce();
    expect(winnersMock).toHaveBeenCalledOnce();
  });

  it.each([
    ["org:member", false],
    ["org:admin", true],
  ])("shows the draw action only to %s", async (role, isAdmin) => {
    authMock.mockResolvedValue({ userId: "user_1", orgId: "org_1", orgRole: role });
    statsMock.mockResolvedValue({
      totalRegistrants: 1, status: "OPEN", winnersDrawn: 0,
      lotteryDate: "2026-09-20", maxTicketsAvailable: 1,
    });
    winnersMock.mockResolvedValue([]);
    const { default: LotteryPage } = await import("@/app/dashboard/lottery/page");
    const html = renderToStaticMarkup(await LotteryPage());

    expect(html.includes("Run Lottery Draw")).toBe(isAdmin);
    expect(html.includes("Number of Winners")).toBe(isAdmin);
    expect(html.includes("Retry result emails for draw date")).toBe(isAdmin);
    expect(html).toContain("Registrants: 1");
  });
});
