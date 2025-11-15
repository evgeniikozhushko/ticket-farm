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
}
