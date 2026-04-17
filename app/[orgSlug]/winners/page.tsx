import { notFound } from "next/navigation";
import { getOrgBySlug } from "@/lib/org-cache";
import { getTicketsCollection, getLotteriesCollection } from "@/lib/mongodb";
import { getTodayDateString } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function OrgWinnersPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const org = await getOrgBySlug(orgSlug);

  if (!org) notFound();

  const date = getTodayDateString(org.timezone);
  const lotteriesCollection = await getLotteriesCollection();
  const ticketsCollection = await getTicketsCollection();

  const lottery = await lotteriesCollection.findOne({ orgId: org.clerkOrgId, date });

  const tickets =
    lottery?.status === "LOTTERY_DRAWN"
      ? await ticketsCollection
          .find({ orgId: org.clerkOrgId, date, status: { $in: ["ACTIVE", "CHECKED_IN"] } })
          .sort({ ticketNumber: 1 })
          .toArray()
      : [];

  return (
    <main className="flex min-h-screen flex-col items-center bg-background px-4 py-12">
      <div className="w-full max-w-lg space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">{org.name}</h1>
          <p className="mt-2 text-muted-foreground">{date} — Winners</p>
        </div>

        {lottery?.status !== "LOTTERY_DRAWN" ? (
          <p className="text-center text-muted-foreground">
            The lottery has not been drawn yet. Check back later today.
          </p>
        ) : tickets.length === 0 ? (
          <p className="text-center text-muted-foreground">No active tickets found for today.</p>
        ) : (
          <ul className="space-y-3">
            {tickets.map((ticket) => (
              <li
                key={ticket.ticketId}
                className="flex items-center justify-between rounded-lg border bg-card p-4"
              >
                <div>
                  <p className="font-semibold">#{ticket.ticketNumber} — {ticket.name}</p>
                  <p className="text-sm text-muted-foreground">Ticket ID: {ticket.ticketId}</p>
                </div>
                <span className="text-xs font-medium text-green-600">{ticket.status}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <a href={`/${orgSlug}`} className="underline underline-offset-4 hover:text-foreground">
            Register for tomorrow
          </a>
        </p>
      </div>
    </main>
  );
}
