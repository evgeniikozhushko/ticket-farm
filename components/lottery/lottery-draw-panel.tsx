"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { IconAlertTriangle, IconTrophy, IconLoader, IconMail, IconMailOff, IconRefresh } from "@tabler/icons-react";
import { toast } from "sonner";
import { drawTodayLottery, retryTodayWinnerEmails } from "@/lib/actions/lottery-draw.actions";
import type { WinnerInfo, LotteryStatus } from "@/lib/types";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LotteryDrawPanelProps {
  initialStatus: LotteryStatus;
  initialWinners: WinnerInfo[];
  totalRegistrants: number;
  defaultWinnerCount: number;
  drawnAt?: string; // Serialized Date as ISO string
}

export function LotteryDrawPanel({
  initialStatus,
  initialWinners,
  totalRegistrants,
  defaultWinnerCount,
  drawnAt,
}: LotteryDrawPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState<LotteryStatus>(initialStatus);
  const [winners, setWinners] = useState<WinnerInfo[]>(initialWinners);
  const [winnerCount, setWinnerCount] = useState(
    defaultWinnerCount > 0 ? defaultWinnerCount : Math.min(10, totalRegistrants)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isRetryingEmails, setIsRetryingEmails] = useState(false);
  const [lastDrawnAt, setLastDrawnAt] = useState<string | undefined>(drawnAt);
  const [emailDispatchError, setEmailDispatchError] = useState<string | undefined>();

  useEffect(() => {
    setStatus(initialStatus);
    setWinners(initialWinners);
    setLastDrawnAt(drawnAt);
    setEmailDispatchError(undefined);
  }, [initialStatus, initialWinners, drawnAt]);

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
        setEmailDispatchError(result.emailDispatchError);

        // Show success message with email status
        const emailsSent = result.winners.filter(w => w.emailSent).length;
        const emailsFailed = result.winners.filter(w => w.emailSent === false).length;

        toast.success(`Successfully drew ${result.winnerCount} winners!`);

        if (emailsSent > 0) {
          toast.success(`Emails sent to ${emailsSent} winner${emailsSent !== 1 ? 's' : ''}`, {
            icon: "📧",
          });
        }

        if (emailsFailed > 0) {
          toast.error(`Failed to send ${emailsFailed} email${emailsFailed !== 1 ? 's' : ''}`, {
            description: "Winners were selected but some emails could not be sent",
          });
        }

        if (result.emailDispatchError) {
          toast.warning("Winner emails did not queue", {
            description: result.emailDispatchError,
          });
        }
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

  const formatTime = (date: string) => {
    return new Date(date).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleRetryEmails = async () => {
    setIsRetryingEmails(true);

    try {
      const result = await retryTodayWinnerEmails();

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      if (result.queued === 0) {
        toast.success("No failed or pending winner emails remain");
      } else {
        toast.success(
          `Queued ${result.queued} winner email${result.queued === 1 ? "" : "s"} for retry`
        );
      }
      if (result.emailDispatchError) {
        setEmailDispatchError(result.emailDispatchError);
        toast.warning("Winner email retry did not dispatch immediately", {
          description: result.emailDispatchError,
        });
      } else {
        setEmailDispatchError(undefined);
      }
      router.refresh();
    } catch (error) {
      toast.error("An unexpected error occurred while retrying winner emails");
      console.error("Retry winner emails error:", error);
    } finally {
      setIsRetryingEmails(false);
    }
  };

  const emailsSent = winners.filter((w) => w.emailSent).length;
  const emailsFailed = winners.filter((w) => w.emailSent === false).length;
  const emailsPending = winners.filter((w) => w.emailSent === undefined).length;
  const emailsUnsent = emailsFailed + emailsPending;

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

            {(() => {
              return (
                <>
                  {emailDispatchError && (
                    <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
                      <IconAlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
                      <AlertDescription className="text-amber-800 dark:text-amber-200">
                        Winners were selected, but email dispatch did not queue. The retry job may recover it.
                        <br />
                        <span className="mt-1 block text-sm">{emailDispatchError}</span>
                      </AlertDescription>
                    </Alert>
                  )}

                  {emailsSent > 0 && (
                    <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                      <IconMail className="size-4 text-green-600 dark:text-green-400" />
                      <AlertDescription className="text-green-800 dark:text-green-200">
                        Emails successfully sent to {emailsSent} winner{emailsSent !== 1 ? 's' : ''}
                      </AlertDescription>
                    </Alert>
                  )}

                  {emailsFailed > 0 && (
                    <Alert className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
                      <IconMailOff className="size-4 text-red-600 dark:text-red-400" />
                      <AlertDescription className="text-red-800 dark:text-red-200">
                        Failed to send emails to {emailsFailed} winner{emailsFailed !== 1 ? 's' : ''}.
                        Winners were selected successfully but email delivery failed.
                        <br />
                        <span className="text-sm mt-1 block">
                          Using (hello@ticketfarm.ca). Emails only send to verified addresses in your{" "}
                          <a
                            href="https://resend.com/emails"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline hover:text-red-900 dark:hover:text-red-100"
                          >
                            Resend dashboard
                          </a>
                          . See EMAIL_RESEND.md for details.
                        </span>
                      </AlertDescription>
                    </Alert>
                  )}

                  {emailsPending > 0 && emailsSent === 0 && emailsFailed === 0 && (
                    <Alert>
                      <IconMail className="size-4" />
                      <AlertDescription>
                        Email status not yet available for {emailsPending} winner{emailsPending !== 1 ? 's' : ''}
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              );
            })()}

            {emailsUnsent > 0 && winners.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={handleRetryEmails}
                disabled={isRetryingEmails}
                className="w-fit"
              >
                {isRetryingEmails ? (
                  <IconLoader className="mr-2 size-4 animate-spin" />
                ) : (
                  <IconRefresh className="mr-2 size-4" />
                )}
                Retry failed emails
              </Button>
            )}

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
                      <TableHead className="w-24 text-center">Email Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {winners.map((winner, index) => (
                      <TableRow key={winner._id}>
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
                        <TableCell className="text-center">
                          {winner.emailSent === true ? (
                            <IconMail
                              className="inline-block size-4 text-green-600 dark:text-green-400"
                              title="Email sent successfully"
                            />
                          ) : winner.emailSent === false ? (
                            <IconMailOff
                              className="inline-block size-4 text-red-600 dark:text-red-400"
                              title={winner.emailError || "Email failed to send"}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
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
