import Link from "next/link";
import { DashboardShell } from "@/components/dashboard-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getParticipantHistory,
  listOrgParticipants,
} from "@/lib/actions/participants.actions";

export const dynamic = "force-dynamic";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; email?: string; cursor?: string }>;
}) {
  const { q = "", email, cursor } = await searchParams;
  const [participantPage, history] = await Promise.all([
    listOrgParticipants({ search: q, cursor, limit: 100 }),
    email ? getParticipantHistory(email) : Promise.resolve([]),
  ]);
  const { participants, nextCursor } = participantPage;

  return (
    <DashboardShell title="Participants">
      <div className="flex flex-1 flex-col">
        <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Participant History</CardTitle>
                  <CardDescription>
                    Public lottery participants grouped by email for this
                    organization.
                  </CardDescription>
                </div>
                <form className="flex w-full gap-2 md:w-auto">
                  <Input
                    name="q"
                    defaultValue={q}
                    placeholder="Search name or email"
                    className="md:w-72"
                  />
                  <Button type="submit" variant="outline">
                    Search
                  </Button>
                </form>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 md:hidden">
                {participants.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    No participants found.
                  </div>
                ) : (
                  participants.map((participant) => (
                    <div
                      key={participant.email}
                      className="rounded-lg border p-4"
                    >
                      <Link
                        href={{
                          pathname: "/dashboard/participants",
                          query: {
                            ...(q ? { q } : {}),
                            email: participant.email,
                          },
                        }}
                        className="break-words font-medium underline underline-offset-4"
                      >
                        {participant.latestName}
                      </Link>
                      <div className="break-all text-sm text-muted-foreground">
                        {participant.email}
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Entries
                          </p>
                          <p className="tabular-nums">
                            {participant.entryCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Wins</p>
                          <p className="tabular-nums">{participant.winCount}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Active
                          </p>
                          <p className="tabular-nums">
                            {participant.activeTicketCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">
                            Checked In
                          </p>
                          <p className="tabular-nums">
                            {participant.checkedInTicketCount}
                          </p>
                        </div>
                      </div>
                      <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                        <p>First: {formatDate(participant.firstEnteredAt)}</p>
                        <p>Last: {formatDate(participant.lastEnteredAt)}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Participant</TableHead>
                      <TableHead className="text-right">Entries</TableHead>
                      <TableHead className="text-right">Wins</TableHead>
                      <TableHead className="text-right">Active</TableHead>
                      <TableHead className="text-right">Checked In</TableHead>
                      <TableHead>First Entry</TableHead>
                      <TableHead>Last Entry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {participants.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-24 text-center text-muted-foreground"
                        >
                          No participants found.
                        </TableCell>
                      </TableRow>
                    ) : (
                      participants.map((participant) => (
                        <TableRow key={participant.email}>
                          <TableCell className="min-w-56">
                            <Link
                              href={{
                                pathname: "/dashboard/participants",
                                query: {
                                  ...(q ? { q } : {}),
                                  email: participant.email,
                                },
                              }}
                              className="break-words font-medium underline underline-offset-4"
                            >
                              {participant.latestName}
                            </Link>
                            <div className="break-all text-sm text-muted-foreground">
                              {participant.email}
                            </div>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {participant.entryCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {participant.winCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {participant.activeTicketCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {participant.checkedInTicketCount}
                          </TableCell>
                          <TableCell className="min-w-40">
                            {formatDate(participant.firstEnteredAt)}
                          </TableCell>
                          <TableCell className="min-w-40">
                            {formatDate(participant.lastEnteredAt)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              {nextCursor && (
                <div className="mt-4 flex justify-end">
                  <Button
                    asChild
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    <Link
                      href={{
                        pathname: "/dashboard/participants",
                        query: {
                          ...(q ? { q } : {}),
                          ...(email ? { email } : {}),
                          cursor: nextCursor,
                        },
                      }}
                    >
                      Next
                    </Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {email && (
            <Card>
              <CardHeader>
                <CardTitle className="break-all">{email}</CardTitle>
                <CardDescription>Entry and ticket history.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 md:hidden">
                  {history.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                      No history found.
                    </div>
                  ) : (
                    history.map((entry) => (
                      <div
                        key={`${entry.date}-${entry.enteredAt.toISOString()}`}
                        className="rounded-lg border p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-mono font-medium">
                              {entry.date}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {formatDate(entry.enteredAt)}
                            </p>
                          </div>
                          <Badge variant={entry.won ? "outline" : "secondary"}>
                            {entry.won ? "Won" : "Entered"}
                          </Badge>
                        </div>
                        <div className="mt-4 text-sm">
                          {entry.ticketId ? (
                            <div className="min-w-0">
                              <p className="break-all font-mono font-medium">
                                #{entry.ticketNumber} / {entry.ticketId}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {entry.ticketStatus}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">
                              No ticket
                            </span>
                          )}
                        </div>
                        <div className="mt-3 break-words text-sm">
                          {entry.emailError ? (
                            <span className="text-red-600">
                              {entry.emailError}
                            </span>
                          ) : entry.emailSent ? (
                            <span className="text-green-700">Sent</span>
                          ) : entry.won ? (
                            <span className="text-muted-foreground">
                              Pending
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Not applicable
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Entered</TableHead>
                        <TableHead>Result</TableHead>
                        <TableHead>Ticket</TableHead>
                        <TableHead>Email</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="h-20 text-center text-muted-foreground"
                          >
                            No history found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        history.map((entry) => (
                          <TableRow
                            key={`${entry.date}-${entry.enteredAt.toISOString()}`}
                          >
                            <TableCell className="font-mono">
                              {entry.date}
                            </TableCell>
                            <TableCell>{formatDate(entry.enteredAt)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={entry.won ? "outline" : "secondary"}
                              >
                                {entry.won ? "Won" : "Entered"}
                              </Badge>
                            </TableCell>
                            <TableCell className="min-w-56">
                              {entry.ticketId ? (
                                <div>
                                  <div className="break-all font-mono font-medium">
                                    #{entry.ticketNumber} / {entry.ticketId}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {entry.ticketStatus}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">
                                  No ticket
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="min-w-40">
                              {entry.emailError ? (
                                <span className="text-red-600">
                                  {entry.emailError}
                                </span>
                              ) : entry.emailSent ? (
                                <span className="text-green-700">Sent</span>
                              ) : entry.won ? (
                                <span className="text-muted-foreground">
                                  Pending
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  Not applicable
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardShell>
  );
}
