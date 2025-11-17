import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { LotteryStatsCards } from "@/components/lottery/lottery-stats-cards";
import { LotteryDrawPanel } from "@/components/lottery/lottery-draw-panel";
import { RegistrantsDataTable } from "@/components/lottery/registrants-data-table";
import {
  getTodayLotteryStats,
  getTodayRegistrants,
  getTodayWinners,
} from "@/lib/actions/lottery-query.actions";

export default async function LotteryAdminPage() {
  // Fetch all data in parallel
  const [stats, registrants, winners] = await Promise.all([
    getTodayLotteryStats(),
    getTodayRegistrants(),
    getTodayWinners(),
  ]);

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 16)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader title="Lottery Admin" />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              {/* Statistics Cards */}
              <LotteryStatsCards stats={stats} />

              {/* Lottery Draw Panel */}
              <LotteryDrawPanel
                initialStatus={stats.status}
                initialWinners={winners}
                totalRegistrants={stats.totalRegistrants}
                defaultWinnerCount={stats.maxTicketsAvailable}
                drawnAt={stats.drawnAt}
              />

              {/* All Registrants Table */}
              <RegistrantsDataTable registrants={registrants} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
