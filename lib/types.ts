import type { ObjectId } from "mongodb";

export interface Registrant {
  _id?: ObjectId; // Mongo will add this when we insert
  name: string;
  email: string;
  date: string; // "YYYY-MM-DD" for the lottery day
  enteredAt: Date; // Time of registration
}

export type LotteryStatus = "OPEN" | "LOTTERY_DRAWN" | "CLOSED";

export interface Lottery {
  _id?: ObjectId;
  date: string; // "YYYY-MM-DD"
  dailyTheme: string;
  status: LotteryStatus;
  maxTicketsAvailable: number;
  winnerRegistrantIds?: ObjectId[]; // IDs of selected winners
  drawnAt?: Date; // Timestamp when lottery was drawn
  // Extend later as needed, e.g. timeSlots, notes, etc.
}

export type TicketStatus = "ACTIVE" | "CANCELED" | "CHECKED_IN";

export interface Ticket {
  _id?: ObjectId;
  ticketNumber: number; // e.g., 1–100
  ticketId: string; // unique identifier you generate
  name: string;
  email: string;
  date: string; // "YYYY-MM-DD"
  pickupTime: string; // e.g., "15:30" or ISO string
  status: TicketStatus;
  generatedAt: Date;
  // Email tracking fields
  emailSent?: boolean; // Whether the winner email was sent
  emailSentAt?: Date; // Timestamp when email was sent
  emailError?: string; // Error message if email failed
}

// Lottery Drawing Types
export interface WinnerInfo {
  _id: string; // Serialized ObjectId as string for Client Components
  name: string;
  email: string;
  enteredAt: string; // Serialized Date as ISO string for Client Components
  ticketNumber?: number; // Sequential ticket number (1, 2, 3...)
  ticketId?: string; // Unique 6-digit ticket ID
  emailSent?: boolean; // Whether the winner email was sent
  emailError?: string; // Error message if email failed
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
      drawnAt: string; // Serialized Date as ISO string for Client Components
    }
  | {
      success: false;
      error: string;
    };
