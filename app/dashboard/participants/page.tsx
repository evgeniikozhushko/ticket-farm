import Link from "next/link";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
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
        <SiteHeader title="Participants" />
        <div className="flex flex-1 flex-col">
          <div className="flex flex-col gap-4 p-4 md:gap-6 md:p-6">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>Participant History</CardTitle>
                    <CardDescription>
                      Public lottery participants grouped by email for this organization.
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
                <div className="overflow-x-auto">
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
                          <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                            No participants found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        participants.map((participant) => (
                          <TableRow key={participant.email}>
                            <TableCell>
                              <Link
                                href={{
                                  pathname: "/dashboard/participants",
                                  query: { ...(q ? { q } : {}), email: participant.email },
                                }}
                                className="font-medium underline underline-offset-4"
                              >
                                {participant.latestName}
                              </Link>
                              <div className="text-sm text-muted-foreground">
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
                            <TableCell>{formatDate(participant.firstEnteredAt)}</TableCell>
                            <TableCell>{formatDate(participant.lastEnteredAt)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {nextCursor && (
                  <div className="mt-4 flex justify-end">
                    <Button asChild variant="outline">
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
                  <CardTitle>{email}</CardTitle>
                  <CardDescription>Entry and ticket history.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
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
                            <TableCell colSpan={5} className="h-20 text-center text-muted-foreground">
                              No history found.
                            </TableCell>
                          </TableRow>
                        ) : (
                          history.map((entry) => (
                            <TableRow key={`${entry.date}-${entry.enteredAt.toISOString()}`}>
                              <TableCell className="font-mono">{entry.date}</TableCell>
                              <TableCell>{formatDate(entry.enteredAt)}</TableCell>
                              <TableCell>
                                <Badge variant={entry.won ? "outline" : "secondary"}>
                                  {entry.won ? "Won" : "Entered"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {entry.ticketId ? (
                                  <div>
                                    <div className="font-mono font-medium">
                                      #{entry.ticketNumber} / {entry.ticketId}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {entry.ticketStatus}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">No ticket</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {entry.emailError ? (
                                  <span className="text-red-600">{entry.emailError}</span>
                                ) : entry.emailSent ? (
                                  <span className="text-green-700">Sent</span>
                                ) : entry.won ? (
                                  <span className="text-muted-foreground">Pending</span>
                                ) : (
                                  <span className="text-muted-foreground">Not applicable</span>
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
      </SidebarInset>
    </SidebarProvider>
  );
}
