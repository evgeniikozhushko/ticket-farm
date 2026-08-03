import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  IconAlertCircle,
  IconCheck,
  IconClock,
  IconMail,
  IconRefresh,
} from "@tabler/icons-react";

const previewTicket = {
  name: "Sarah Miller",
  ticketNumber: 1,
  ticketId: "A9K4M2Q8X7P1",
  date: "August 12, 2026",
  pickupTime: "4:00-7:00 PM",
  orgName: "Canmore Community Association",
  pickupLocation: "Canmore Community Centre",
};

const deliveryStatuses = [
  {
    name: "Sarah Miller",
    ticketNumber: 1,
    status: "Delivered",
    time: "2 min ago",
    icon: IconCheck,
  },
  {
    name: "Omar Khan",
    ticketNumber: 2,
    status: "Sent",
    time: "5 min ago",
    icon: IconClock,
  },
  {
    name: "Priya Shah",
    ticketNumber: 3,
    status: "Failed",
    time: "8 min ago",
    icon: IconAlertCircle,
    problem: true,
  },
];

export function TicketDeliveryPreview() {
  return (
    <div className="h-full rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex h-full min-h-0 flex-col gap-4">
        <div className="flex min-h-0 flex-[3] flex-col overflow-hidden rounded-lg border bg-background shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <IconMail className="size-4" />
              Inbox
            </div>

            <span className="text-xs text-muted-foreground">2 min ago</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-5">
            <div className="mx-auto max-w-md py-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {previewTicket.orgName}
              </p>
              <h3 className="mt-3 text-2xl font-bold tracking-normal">
                Ticket is ready
              </h3>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Congratulations, {previewTicket.name}. You have been selected
                for a ticket from {previewTicket.orgName}.
              </p>

              <p className="mt-3 text-xs text-muted-foreground">
                Subject: Your ticket #{previewTicket.ticketNumber} from{" "}
                {previewTicket.orgName} is ready.
              </p>

              {/* Email body */}
              <div className="mt-5 rounded-lg border bg-muted/20 p-4">
                <div className="grid grid-cols-[38%_62%] gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ticket number
                    </p>
                    <p className="mt-1 text-2xl font-bold">
                      #{previewTicket.ticketNumber}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ticket reference
                    </p>
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {previewTicket.ticketId}
                    </p>
                  </div>
                </div>

                <div className="my-4 border-t" />

                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Date</dt>
                    <dd className="font-medium">{previewTicket.date}</dd>
                  </div>

                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Pickup time
                    </dt>
                    <dd className="font-medium">{previewTicket.pickupTime}</dd>
                  </div>
                </dl>

                <dl className="mt-4 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Pickup location
                    </dt>
                    <dd className="font-medium">
                      {previewTicket.pickupLocation}
                    </dd>
                  </div>
                </dl>
              </div>

              <h4 className="mt-5 text-sm font-semibold">
                Pickup instructions
              </h4>
              <p className="mt-5 text-sm leading-6 text-muted-foreground">
                Bring this email, ticket number, or ticket reference when you
                collect your ticket. Please arrive during the pickup time shown
                above. If you can no longer attend, contact{" "}
                {previewTicket.orgName} as soon as possible.
              </p>

              <div className="mt-5 border-t pt-4">
                <p className="text-center text-xs text-muted-foreground">
                  This email was sent automatically by {previewTicket.orgName}.
                </p>
                <p className="mt-1 text-center font-mono text-[11px] text-muted-foreground">
                  Ticket reference: {previewTicket.ticketId}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-[2] overflow-hidden rounded-lg border bg-muted/30 p-4">
          <div className="flex h-full flex-col gap-4">
            <div>
              <h3 className="text-sm font-semibold">Delivery status</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Winner emails are tracked after the draw.
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {deliveryStatuses.map((item) => {
                const StatusIcon = item.icon;

                return (
                  <div
                    key={item.name}
                    className="rounded-lg border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ticket #{item.ticketNumber}
                        </p>
                      </div>

                      {item.problem ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="size-8 shrink-0 border-amber-500/50 text-amber-700"
                          aria-label={`Retry ${item.name} delivery`}
                        >
                          <IconRefresh className="size-4" />
                        </Button>
                      ) : (
                        <StatusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Badge
                        variant="outline"
                        className={
                          item.problem
                            ? "border-red-500/50 text-red-700 dark:text-red-400"
                            : "text-muted-foreground"
                        }
                      >
                        {item.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {item.time}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
