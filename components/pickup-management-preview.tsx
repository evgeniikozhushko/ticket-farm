import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  IconCircleCheck,
  IconPackage,
  IconSearch,
  IconX,
} from "@tabler/icons-react";

const inventory = [
  { label: "Issued", value: 24 },
  { label: "Picked up", value: 17 },
  { label: "Canceled", value: 2 },
  { label: "Remaining", value: 5 },
] as const;

const winners = [
  {
    name: "Maya Chen",
    email: "maya.chen@example.com",
    ticketNumber: 7,
    ticketId: "M8C4R2T9K6Q1",
    status: "ACTIVE",
  },
  {
    name: "Jordan Brooks",
    email: "jordan.brooks@example.com",
    ticketNumber: 12,
    ticketId: "B7N2P5W8D4L3",
    status: "CHECKED_IN",
  },
  {
    name: "Priya Shah",
    email: "priya.shah@example.com",
    ticketNumber: 19,
    ticketId: "S3H9V6A2F8J5",
    status: "CANCELED",
  },
] as const;

const statusStyles = {
  ACTIVE:
    "border-blue-500/40 text-blue-700 dark:border-blue-400/40 dark:text-blue-300",
  CHECKED_IN:
    "border-green-500/40 text-green-700 dark:border-green-400/40 dark:text-green-300",
  CANCELED:
    "border-red-500/40 text-red-700 dark:border-red-400/40 dark:text-red-300",
} as const;

export function PickupManagementPreview() {
  return (
    <div className="flex h-auto flex-col gap-4 overflow-hidden rounded-xl border bg-card p-4 shadow-sm xl:h-full xl:min-h-0 xl:gap-3">
      <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            Today&apos;s pickups
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            August 27, 2026
          </p>
        </div>

        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search name, email, ticket number, or ticket ID"
            aria-label="Find a winner by name, email, ticket number, or ticket ID"
            className="h-10 pl-9 text-sm disabled:cursor-default disabled:opacity-100 xl:h-9"
            disabled
          />
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-2 overflow-hidden rounded-lg border bg-muted/20 sm:grid-cols-4">
        {inventory.map((item, index) => (
          <div
            key={item.label}
            className={
              index === 0
                ? "min-w-0 px-2 py-2"
                : "min-w-0 border-l px-2 py-2"
            }
          >
            <dd className="text-xl font-semibold leading-6 tabular-nums">
              {item.value}
            </dd>
            <dt className="truncate text-xs leading-4 text-muted-foreground">
              {item.label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="shrink-0 rounded-lg border bg-background xl:min-h-0 xl:flex-1 xl:overflow-y-auto">
        <div className="divide-y">
          {winners.map((winner) => (
            <div
              key={winner.ticketId}
              className="flex items-center gap-3 px-3 py-3 xl:py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium leading-5">
                  {winner.name}
                </p>
                <p className="truncate text-xs leading-4 text-muted-foreground">
                  Ticket #{winner.ticketNumber}
                  <span className="hidden xl:inline">
                    {" "}
                    &middot; {winner.ticketId} &middot; {winner.email}
                  </span>
                </p>
              </div>

              <Badge
                variant="outline"
                className={`px-2 py-0.5 text-xs leading-4 ${statusStyles[winner.status]}`}
              >
                {winner.status}
              </Badge>

              {winner.status === "ACTIVE" && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-8 border-green-500/40 text-green-700 disabled:opacity-100 dark:text-green-300"
                    aria-label={`Confirm pickup for ${winner.name}`}
                    disabled
                  >
                    <IconCircleCheck className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-8 border-red-500/40 text-red-700 disabled:opacity-100 dark:text-red-300"
                    aria-label={`Cancel ticket for ${winner.name}`}
                    disabled
                  >
                    <IconX className="size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 rounded-lg border bg-muted/30 p-3 xl:py-2">
        <IconPackage className="size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium leading-5">
            Remaining inventory
          </p>
          <p className="truncate text-xs leading-4 text-muted-foreground">
            5 of 24 tickets are still available
          </p>
        </div>
        <Badge
          variant="secondary"
          className="text-xs tabular-nums"
        >
          5
        </Badge>
      </div>
    </div>
  );
}
