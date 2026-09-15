import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailTicket, EmailResult, NonWinnerEmail } from "@/lib/email";

const nonWinnerNotifications = vi.hoisted(() => vi.fn());
vi.mock("@/lib/non-winner-notifications", () => ({ sendNonWinnerNotifications: nonWinnerNotifications }));

const sendBulkWinnerEmailsMock = vi.hoisted(() => vi.fn());
const ticketsCollection = vi.hoisted(() => ({
  find: vi.fn(),
  bulkWrite: vi.fn(),
}));
const createFunctionMock = vi.hoisted(() =>
  vi.fn((_options, _trigger, handler) => handler)
);

vi.mock("@/lib/email", () => ({
  sendBulkWinnerEmails: sendBulkWinnerEmailsMock,
}));

vi.mock("@/lib/mongodb", () => ({
  getTicketsCollection: vi.fn(() => Promise.resolve(ticketsCollection)),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { createFunction: createFunctionMock },
}));

const eventTickets: EmailTicket[] = [
  {
    name: "Ada",
    email: "ada@example.com",
    ticketNumber: 1,
    ticketId: "TICKETADA001",
    date: "2026-05-28",
    pickupTime: "5:30 PM",
    orgName: "Ticket Farm",
    emailFromAddress: "hello@ticketfarm.ca",
    emailFromName: "Ticket Farm",
  },
  {
    name: "Lin",
    email: "lin@example.com",
    ticketNumber: 2,
    ticketId: "TICKETLIN002",
    date: "2026-05-28",
    pickupTime: "5:30 PM",
    orgName: "Ticket Farm",
    emailFromAddress: "hello@ticketfarm.ca",
    emailFromName: "Ticket Farm",
  },
];

function findResult(rows: unknown[]) {
  return {
    toArray: vi.fn(() => Promise.resolve(rows)),
  };
}

async function runFunction(nonWinners: NonWinnerEmail[] = []) {
  vi.resetModules();
  const { sendWinnerEmailsFunction } = await import("@/inngest/functions/send-winner-emails");
  const handler = sendWinnerEmailsFunction as unknown as (input: {
    event: {
      name: "lottery/draw.completed";
      data: {
        orgId: string;
        date: string;
        tickets: EmailTicket[];
        nonWinners: NonWinnerEmail[];
      };
    };
  }) => Promise<unknown>;
  return handler({
    event: {
      name: "lottery/draw.completed",
      data: {
        orgId: "org_1",
        date: "2026-05-28",
        tickets: eventTickets,
        nonWinners,
      },
    },
  });
}

describe("sendWinnerEmailsFunction", () => {
  beforeEach(() => {
    sendBulkWinnerEmailsMock.mockReset();
    ticketsCollection.find.mockReset();
    ticketsCollection.bulkWrite.mockReset().mockResolvedValue({ modifiedCount: 1 });
    nonWinnerNotifications.mockReset().mockResolvedValue({ sent: 0, skipped: 0, failed: 0 });
  });

  it("dispatches non-winners even when every winner email was already sent", async () => {
    ticketsCollection.find.mockReturnValue(findResult(eventTickets.map((ticket) => ({ ...ticket, emailSent: true }))));
    const nonWinner = { registrantId: "507f1f77bcf86cd799439011", email: "other@example.com", date: "2026-05-28", orgName: "Org", emailFromAddress: "hello@ticketfarm.ca", emailFromName: "Org" };
    nonWinnerNotifications.mockResolvedValue({ sent: 1, skipped: 0, failed: 0 });
    expect(await runFunction([nonWinner])).toMatchObject({ sent: 1, skipped: 2 });
    expect(nonWinnerNotifications).toHaveBeenCalledWith("org_1", "2026-05-28", [nonWinner]);
    expect(sendBulkWinnerEmailsMock).not.toHaveBeenCalled();
  });

  it("fails the job for retry when a non-winner notification fails", async () => {
    ticketsCollection.find.mockReturnValue(findResult([]));
    nonWinnerNotifications.mockResolvedValue({ sent: 0, skipped: 0, failed: 1 });
    const nonWinner = { registrantId: "507f1f77bcf86cd799439011", email: "other@example.com", date: "2026-05-28", orgName: "Org", emailFromAddress: "hello@ticketfarm.ca", emailFromName: "Org" };
    await expect(runFunction([nonWinner])).rejects.toThrow("Failed to send 1 result emails.");
  });

  it("skips tickets already marked sent", async () => {
    ticketsCollection.find.mockReturnValue(
      findResult([
        { orgId: "org_1", date: "2026-05-28", ticketId: "TICKETADA001", emailSent: true },
        { orgId: "org_1", date: "2026-05-28", ticketId: "TICKETLIN002", emailSent: false },
      ])
    );
    sendBulkWinnerEmailsMock.mockResolvedValue([
      { success: true, email: "lin@example.com", messageId: "msg_1" },
    ] satisfies EmailResult[]);

    await expect(runFunction()).resolves.toMatchObject({
      sent: 1,
      failed: 0,
      skipped: 1,
    });

    expect(sendBulkWinnerEmailsMock).toHaveBeenCalledWith([eventTickets[1]]);
    expect(ticketsCollection.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { orgId: "org_1", date: "2026-05-28", ticketId: "TICKETLIN002", emailSent: { $ne: true } },
          update: {
            $set: {
              emailSent: true,
              emailSentAt: expect.any(Date),
            },
            $unset: { emailError: "" },
          },
        },
      },
    ]);
  });

  it("persists failures, unsets stale sent timestamps, and throws for Inngest retry", async () => {
    ticketsCollection.find.mockReturnValue(
      findResult([
        {
          orgId: "org_1",
          date: "2026-05-28",
          ticketId: "TICKETADA001",
          emailSent: false,
          emailSentAt: new Date("2026-05-28T12:00:00Z"),
        },
      ])
    );
    sendBulkWinnerEmailsMock.mockResolvedValue([
      { success: false, email: "ada@example.com", error: "sender not verified" },
    ] satisfies EmailResult[]);

    await expect(runFunction()).rejects.toThrow("Failed to send 1 winner email.");

    expect(ticketsCollection.bulkWrite).toHaveBeenCalledWith([
      {
        updateOne: {
          filter: { orgId: "org_1", date: "2026-05-28", ticketId: "TICKETADA001", emailSent: { $ne: true } },
          update: {
            $set: {
              emailSent: false,
              emailError: "sender not verified",
            },
            $unset: { emailSentAt: "" },
          },
        },
      },
    ]);
  });
});
