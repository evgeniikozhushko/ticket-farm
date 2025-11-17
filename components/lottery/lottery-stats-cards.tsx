"use client";

import { Card, CardHeader, CardDescription, CardTitle, CardAction, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconUsers, IconTrophy, IconClock, IconCheck } from "@tabler/icons-react";
import type { LotteryStats } from "@/lib/types";

interface LotteryStatsCardsProps {
  stats: LotteryStats;
}

export function LotteryStatsCards({ stats }: LotteryStatsCardsProps) {
  const getStatusBadge = () => {
    switch (stats.status) {
      case "OPEN":
        return (
          <Badge variant="outline" className="border-green-500 text-green-700 dark:text-green-400">
            <IconClock className="mr-1 size-3" />
            Open
          </Badge>
        );
      case "LOTTERY_DRAWN":
        return (
          <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400">
            <IconCheck className="mr-1 size-3" />
            Drawn
          </Badge>
        );
      case "CLOSED":
        return (
          <Badge variant="outline" className="border-gray-500 text-gray-700 dark:text-gray-400">
            Closed
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatTime = (date?: Date) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      {/* Card 1: Total Registrants Today */}
      <Card className="@container/card" data-slot="card">
        <CardHeader>
          <CardDescription>Registrants Today</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.totalRegistrants}
          </CardTitle>
          <CardAction>
            <IconUsers className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium text-muted-foreground">
            {stats.lotteryDate}
          </div>
        </CardFooter>
      </Card>

      {/* Card 2: Lottery Status */}
      <Card className="@container/card" data-slot="card">
        <CardHeader>
          <CardDescription>Lottery Status</CardDescription>
          <CardTitle className="text-2xl font-semibold @[250px]/card:text-3xl">
            {getStatusBadge()}
          </CardTitle>
          <CardAction>
            <IconClock className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium text-muted-foreground">
            {stats.status === "LOTTERY_DRAWN" && stats.drawnAt
              ? `Drawn at ${formatTime(stats.drawnAt)}`
              : "Awaiting draw"}
          </div>
        </CardFooter>
      </Card>

      {/* Card 3: Winners Drawn */}
      <Card className="@container/card" data-slot="card">
        <CardHeader>
          <CardDescription>Winners Selected</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.winnersDrawn > 0 ? stats.winnersDrawn : "—"}
          </CardTitle>
          <CardAction>
            <IconTrophy className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium text-muted-foreground">
            {stats.winnersDrawn > 0
              ? `Out of ${stats.totalRegistrants} registrants`
              : "Not drawn yet"}
          </div>
        </CardFooter>
      </Card>

      {/* Card 4: Max Tickets Available */}
      <Card className="@container/card" data-slot="card">
        <CardHeader>
          <CardDescription>Max Tickets</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {stats.maxTicketsAvailable > 0 ? stats.maxTicketsAvailable : "—"}
          </CardTitle>
          <CardAction>
            <IconCheck className="size-5 text-muted-foreground" />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="font-medium text-muted-foreground">
            {stats.maxTicketsAvailable > 0 ? "Configured" : "Not set"}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
