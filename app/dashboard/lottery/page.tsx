import { DashboardShell } from "@/components/dashboard-shell";
import { LotteryStatsCards } from "@/components/lottery/lottery-stats-cards";
import { LotteryDrawPanel } from "@/components/lottery/lottery-draw-panel";
import { RegistrantsDataTable } from "@/components/lottery/registrants-data-table";
import { TicketRedemptionPanel } from "@/components/lottery/ticket-redemption-panel";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  getTodayLotteryStats,
  getTodayRegistrants,
  getTodayWinners,
} from "@/lib/actions/lottery-query.actions";
import type { SerializedLotteryStats, SerializedRegistrant } from "@/lib/types";

export const dynamic = 'force-dynamic';

export default async function LotteryAdminPage() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

  // Fetch all data in parallel
  const [stats, registrants, winners] = await Promise.all([
    getTodayLotteryStats(),
    getTodayRegistrants(),
    getTodayWinners(),
  ]);

  // Serialize MongoDB data for client components
  // Convert ObjectId and Date objects to plain strings for React serialization
  const serializedStats: SerializedLotteryStats = {
    ...stats,
    drawnAt: stats.drawnAt?.toISOString(),
  };

  if (serializedStats.unavailable) {
    return (
      <DashboardShell title="Lottery">
        <div className="p-6 text-sm text-muted-foreground">
          Lottery data is temporarily unavailable. Please try again shortly.
        </div>
      </DashboardShell>
    );
  }

  const serializedRegistrants: SerializedRegistrant[] = registrants.map((r) => ({
    orgId: r.orgId,
    name: r.name,
    email: r.email,
    date: r.date,
    _id: r._id?.toString() ?? "",
    enteredAt: r.enteredAt.toISOString(),
  }));

  // Winners are already serialized by getTodayWinners()
  const serializedWinners = winners;

  return (
    <DashboardShell title="Lottery">
      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            {/* Statistics Cards */}
            <LotteryStatsCards stats={serializedStats} />

            {/* Lottery Draw Panel */}
            <LotteryDrawPanel
              isAdmin={orgRole === "org:admin"}
              initialStatus={serializedStats.status}
              initialWinners={serializedWinners}
              totalRegistrants={serializedStats.totalRegistrants}
              defaultWinnerCount={serializedStats.maxTicketsAvailable}
              drawnAt={serializedStats.drawnAt}
            />

            <TicketRedemptionPanel />

            {/* All Registrants Table */}
            {serializedStats.totalRegistrants > serializedRegistrants.length && (
              <p className="px-4 text-sm text-muted-foreground md:px-6">
                Showing the first {serializedRegistrants.length} of {serializedStats.totalRegistrants.toLocaleString()} registrants today.
              </p>
            )}
            <RegistrantsDataTable registrants={serializedRegistrants} />
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
