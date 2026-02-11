import type { ObjectId } from "mongodb";

// ---------------------------------------------------------------------------
// Organization
// ---------------------------------------------------------------------------

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "free";
export type PlanName = "free" | "starter" | "growth" | "scale";

export interface Organization {
  _id?: ObjectId;
  clerkOrgId: string;           // Clerk org_xxx — primary external key
  name: string;
  slug: string;                 // URL slug, unique (e.g. "canmore-food-recovery")
  timezone: string;             // IANA timezone string (e.g. "America/Edmonton")
  publicPageEnabled: boolean;
  emailFromName: string;
  emailFromAddress: string;     // Resend verified sender address
  stripeCustomerId?: string;
  stripePriceId?: string;
  subscriptionStatus: SubscriptionStatus;
  statusUpdatedAt?: Date;       // Timestamp of last Stripe status event (out-of-order guard)
  planName: PlanName;
  maxRegistrantsPerDay: number; // Enforced atomically via Lottery.registrantCount
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Registrant
// ---------------------------------------------------------------------------

export interface Registrant {
  _id?: ObjectId;
  orgId: string;       // Clerk org_xxx
  name: string;
  email: string;
  date: string;        // "YYYY-MM-DD"
  enteredAt: Date;
}

// ---------------------------------------------------------------------------
// Lottery
// ---------------------------------------------------------------------------

export type LotteryStatus = "OPEN" | "LOTTERY_DRAWN" | "CLOSED";

export interface Lottery {
  _id?: ObjectId;
  orgId: string;                  // Clerk org_xxx
  date: string;                   // "YYYY-MM-DD"
  dailyTheme: string;
  status: LotteryStatus;
  maxTicketsAvailable: number;
  registrantCount: number;        // Atomic quota counter — incremented on each registration
  winnerRegistrantIds?: ObjectId[];
  drawnAt?: Date;
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

export type TicketStatus = "ACTIVE" | "CANCELED" | "CHECKED_IN";

export interface Ticket {
  _id?: ObjectId;
  orgId: string;        // Clerk org_xxx
  ticketNumber: number;
  ticketId: string;     // Unique 6-digit ID
  name: string;
  email: string;
  date: string;         // "YYYY-MM-DD"
  pickupTime: string;
  status: TicketStatus;
  generatedAt: Date;
  emailSent?: boolean;
  emailSentAt?: Date;
  emailError?: string;
}

// ---------------------------------------------------------------------------
// Webhook idempotency
// ---------------------------------------------------------------------------

export interface ProcessedWebhookEvent {
  _id?: ObjectId;
  stripeEventId: string;
  processedAt: Date;
}

// ---------------------------------------------------------------------------
// Client-facing serialized types (ObjectId/Date → string for RSC boundary)
// ---------------------------------------------------------------------------

export interface WinnerInfo {
  _id: string;
  name: string;
  email: string;
  enteredAt: string;
  ticketNumber?: number;
  ticketId?: string;
  emailSent?: boolean;
  emailError?: string;
}

export interface LotteryStats {
  totalRegistrants: number;
  status: LotteryStatus;
  winnersDrawn: number;
  lotteryDate: string;
  drawnAt?: Date;
  maxTicketsAvailable: number;
}

export type DrawLotteryResult =
  | {
      success: true;
      winners: WinnerInfo[];
      winnerCount: number;
      drawnAt: string;
    }
  | {
      success: false;
      error: string;
    };
