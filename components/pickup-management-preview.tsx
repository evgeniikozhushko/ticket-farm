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
    <div className="flex h-full min-h-0 flex-col gap-1 overflow-hidden rounded-xl border bg-card p-2 shadow-sm sm:gap-3 sm:p-4">
      <div className="flex shrink-0 items-center gap-3">
        <div className="hidden min-w-0 sm:block">
          <h3 className="truncate text-sm font-semibold">
            Today&apos;s pickups
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            August 27, 2026
          </p>
        </div>

        <div className="relative min-w-0 flex-1">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground sm:size-4" />
          <Input
            type="search"
            placeholder="Search name, email, ticket number, or ticket ID"
            aria-label="Find a winner by name, email, ticket number, or ticket ID"
            className="h-8 pl-8 text-xs disabled:cursor-default disabled:opacity-100 sm:h-9"
            disabled
          />
        </div>
      </div>

      <dl className="grid shrink-0 grid-cols-4 overflow-hidden rounded-lg border bg-muted/20">
        {inventory.map((item, index) => (
          <div
            key={item.label}
            className={
              index === 0
                ? "min-w-0 px-1 py-1 sm:px-2 sm:py-2"
                : "min-w-0 border-l px-1 py-1 sm:px-2 sm:py-2"
            }
          >
            <dd className="text-sm font-semibold leading-4 tabular-nums sm:text-lg sm:leading-5">
              {item.value}
            </dd>
            <dt className="truncate text-[9px] leading-3 text-muted-foreground sm:text-[11px]">
              {item.label}
            </dt>
          </div>
        ))}
      </dl>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-background">
        <div className="divide-y">
          {winners.map((winner) => (
            <div
              key={winner.ticketId}
              className="flex min-h-0 items-center gap-1.5 px-2 py-1 sm:gap-3 sm:px-3 sm:py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium leading-4 sm:text-sm">
                  {winner.name}
                </p>
                <p className="truncate text-[9px] leading-3 text-muted-foreground sm:text-xs sm:leading-4">
                  Ticket #{winner.ticketNumber}
                  <span className="hidden sm:inline">
                    {" "}
                    &middot; {winner.ticketId} &middot; {winner.email}
                  </span>
                </p>
              </div>

              <Badge
                variant="outline"
                className={`px-1.5 py-0 text-[8px] leading-4 sm:text-[10px] ${statusStyles[winner.status]}`}
              >
                {winner.status}
              </Badge>

              {winner.status === "ACTIVE" && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-7 border-green-500/40 text-green-700 disabled:opacity-100 dark:text-green-300 sm:size-8"
                    aria-label={`Confirm pickup for ${winner.name}`}
                    disabled
                  >
                    <IconCircleCheck className="size-3.5 sm:size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-7 border-red-500/40 text-red-700 disabled:opacity-100 dark:text-red-300 sm:size-8"
                    aria-label={`Cancel ticket for ${winner.name}`}
                    disabled
                  >
                    <IconX className="size-3.5 sm:size-4" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-muted/30 px-2 py-1.5 sm:px-3 sm:py-2">
        <IconPackage className="size-3.5 shrink-0 text-muted-foreground sm:size-4" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[10px] font-medium leading-3 sm:text-xs sm:leading-4">
            Remaining inventory
          </p>
          <p className="truncate text-[9px] leading-3 text-muted-foreground sm:text-[11px]">
            5 of 24 tickets are still available
          </p>
        </div>
        <Badge
          variant="secondary"
          className="text-[9px] tabular-nums sm:text-xs"
        >
          5
        </Badge>
      </div>
    </div>
  );
}
