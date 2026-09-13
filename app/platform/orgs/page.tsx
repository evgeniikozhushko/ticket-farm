import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listOrgDirectory } from "@/lib/actions/platform.actions";

function formatDate(date?: Date): string {
  if (!date) return "Never";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function PlatformOrgsPage() {
  const orgs = await listOrgDirectory();

  return (
    <main className="min-h-svh bg-background p-4 md:p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Platform</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Organizations
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Org Directory</CardTitle>
            <CardDescription>
              View-only tenant overview across Ticket Farm.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 md:hidden">
              {orgs.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                  No organizations found.
                </div>
              ) : (
                orgs.map((org) => (
                  <div key={org.orgId} className="rounded-lg border p-4">
                    <div className="min-w-0">
                      <p className="break-words font-medium">{org.name}</p>
                      <p className="break-all font-mono text-xs text-muted-foreground">
                        {org.orgId}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Link
                        href={org.publicPageUrl}
                        className="break-all font-mono text-sm underline underline-offset-4"
                      >
                        /{org.slug}
                      </Link>
                      <Badge
                        variant={
                          org.publicPageEnabled ? "outline" : "secondary"
                        }
                      >
                        {org.publicPageEnabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {org.subscriptionStatus}
                      </Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Today</p>
                        <p className="tabular-nums">
                          {org.todaysRegistrants.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          Registrants
                        </p>
                        <p className="tabular-nums">
                          {org.totalRegistrants.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tickets</p>
                        <p className="tabular-nums">
                          {org.totalTickets.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                      <p className="capitalize">Plan: {org.planName}</p>
                      <p>Created: {formatDate(org.createdAt)}</p>
                      <p>Last activity: {formatDate(org.lastActivityAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Organization</TableHead>
                    <TableHead>Public Page</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Today</TableHead>
                    <TableHead className="text-right">Registrants</TableHead>
                    <TableHead className="text-right">Tickets</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgs.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={9}
                        className="h-24 text-center text-muted-foreground"
                      >
                        No organizations found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    orgs.map((org) => (
                      <TableRow key={org.orgId}>
                        <TableCell className="min-w-56">
                          <div className="break-words font-medium">
                            {org.name}
                          </div>
                          <div className="break-all font-mono text-xs text-muted-foreground">
                            {org.orgId}
                          </div>
                        </TableCell>
                        <TableCell className="min-w-48">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={org.publicPageUrl}
                              className="break-all font-mono text-sm underline underline-offset-4"
                            >
                              /{org.slug}
                            </Link>
                            <Badge
                              variant={
                                org.publicPageEnabled ? "outline" : "secondary"
                              }
                            >
                              {org.publicPageEnabled ? "Enabled" : "Disabled"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="capitalize">
                          {org.planName}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {org.subscriptionStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.todaysRegistrants.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.totalRegistrants.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {org.totalTickets.toLocaleString()}
                        </TableCell>
                        <TableCell>{formatDate(org.createdAt)}</TableCell>
                        <TableCell>{formatDate(org.lastActivityAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
