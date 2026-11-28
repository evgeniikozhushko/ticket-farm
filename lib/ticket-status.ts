import type { TicketStatus } from "@/lib/types";

export const ticketStatusLabels: Record<TicketStatus, string> = {
  ACTIVE: "Active",
  CHECKED_IN: "Checked in",
  CANCELED: "Canceled",
};
