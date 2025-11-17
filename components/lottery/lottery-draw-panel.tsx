"use client";

import { useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { IconTrophy, IconLoader } from "@tabler/icons-react";
import { toast } from "sonner";
import { drawTodayLottery } from "@/lib/actions/lottery-draw.actions";
import type { WinnerInfo, LotteryStatus } from "@/lib/types";

interface LotteryDrawPanelProps {
  initialStatus: LotteryStatus;
  initialWinners: WinnerInfo[];
  totalRegistrants: number;
  defaultWinnerCount: number;
  drawnAt?: Date;
}

export function LotteryDrawPanel({
  initialStatus,
  initialWinners,
  totalRegistrants,
  defaultWinnerCount,
  drawnAt,
}: LotteryDrawPanelProps) {
  const [status, setStatus] = useState<LotteryStatus>(initialStatus);
  const [winners, setWinners] = useState<WinnerInfo[]>(initialWinners);
  const [winnerCount, setWinnerCount] = useState(
    defaultWinnerCount > 0 ? defaultWinnerCount : Math.min(10, totalRegistrants)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [lastDrawnAt, setLastDrawnAt] = useState<Date | undefined>(drawnAt);

  const handleDraw = async () => {
    if (winnerCount <= 0) {
      toast.error("Please enter a valid number of winners");
      return;
    }

    if (winnerCount > totalRegistrants) {
      toast.error(`Cannot draw ${winnerCount} winners from ${totalRegistrants} registrants`);
      return;
    }

    setIsLoading(true);

    try {
      const result = await drawTodayLottery(winnerCount);

      if (result.success) {
        setStatus("LOTTERY_DRAWN");
        setWinners(result.winners);
        setLastDrawnAt(result.drawnAt);
        toast.success(`Successfully drew ${result.winnerCount} winners!`);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      toast.error("An unexpected error occurred while drawing the lottery");
      console.error("Draw lottery error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Card className="mx-4 lg:mx-6">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle>Lottery Draw</CardTitle>
            <CardDescription>
              {status === "OPEN"
                ? "Select number of winners and run the draw"
                : `Lottery drawn on ${lastDrawnAt ? formatDate(lastDrawnAt) : "today"}`}
            </CardDescription>
          </div>
          {status === "LOTTERY_DRAWN" && (
            <Badge variant="outline" className="border-blue-500 text-blue-700 dark:text-blue-400">
              <IconTrophy className="mr-1 size-3" />
              Drawn
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {status === "OPEN" ? (
          <div className="space-y-6">
            {totalRegistrants === 0 ? (
              <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-muted-foreground">
                  No registrants for today. Cannot run lottery draw.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="winnerCount">Number of Winners</Label>
                  <Input
                    id="winnerCount"
                    type="number"
                    min="1"
                    max={totalRegistrants}
                    value={winnerCount}
                    onChange={(e) => setWinnerCount(parseInt(e.target.value) || 0)}
                    className="max-w-xs"
                  />
                  <p className="text-sm text-muted-foreground">
                    Maximum: {totalRegistrants} (total registrants)
                  </p>
                </div>
                <Button onClick={handleDraw} disabled={isLoading} size="lg">
                  {isLoading ? (
                    <>
                      <IconLoader className="mr-2 size-4 animate-spin" />
                      Drawing...
                    </>
                  ) : (
                    <>
                      <IconTrophy className="mr-2 size-4" />
                      Run Lottery Draw
                    </>
                  )}
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                <strong className="text-foreground">{winners.length} winners</strong> selected from{" "}
                <strong className="text-foreground">{totalRegistrants} registrants</strong>
                {lastDrawnAt && (
                  <>
                    {" "}
                    at <strong className="text-foreground">{formatTime(lastDrawnAt)}</strong>
                  </>
                )}
              </p>
            </div>

            {winners.length > 0 && (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Ticket #</TableHead>
                      <TableHead>Ticket ID</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {winners.map((winner, index) => (
                      <TableRow key={winner._id.toString()}>
                        <TableCell className="font-medium">{index + 1}</TableCell>
                        <TableCell>{winner.name}</TableCell>
                        <TableCell className="text-muted-foreground">{winner.email}</TableCell>
                        <TableCell className="font-mono font-semibold text-primary">
                          {winner.ticketNumber
                            ? String(winner.ticketNumber).padStart(3, "0")
                            : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm text-muted-foreground">
                          {winner.ticketId || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
