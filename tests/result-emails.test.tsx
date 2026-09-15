import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import WinnerTicketEmail from "@/emails/winner-ticket-email";
import NonWinnerEmail from "@/emails/non-winner-email";
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
import { sendWinnerEmail, sendNonWinnerEmail } from "@/lib/email";

const ticket = { name: "Ada", email: "ada@example.com", orgName: "Community Org", ticketNumber: 27, ticketId: "4ISW51HA9O0Z", date: "2026-09-14", pickupTime: "5 PM", pickupLocation: "Community desk", emailFromName: "Org", emailFromAddress: "hello@ticketfarm.ca" };
beforeEach(() => { send.mockReset().mockResolvedValue({ data: { id: "message" }, error: null }); });
it("renders reference-only redemption instructions and existing pickup details", () => {
  const html = renderToStaticMarkup(<WinnerTicketEmail {...ticket} />);
  for (const text of ["Ticket #27", "Reference: 4ISW51HA9O0Z", "Community Org", "Lottery date", "2026-09-14", "5 PM", "Community desk", "ticket number alone cannot"]) expect(html).toContain(text);
  expect(html).not.toContain("Pickup date");
  expect(renderToStaticMarkup(<WinnerTicketEmail {...ticket} pickupLocation={undefined} />)).not.toContain("Pickup location");
});
it("renders a simple non-winner result without ticket information", () => {
  const html = renderToStaticMarkup(<NonWinnerEmail orgName={ticket.orgName} date={ticket.date} />);
  for (const text of ["completed", "not selected", "No additional action is required"]) expect(html).toContain(text);
  expect(html).not.toContain("Reference:");
});
it("uses stable provider keys on retries and targets the saved email", async () => {
  await sendWinnerEmail(ticket);
  await sendWinnerEmail(ticket);
  expect(send).toHaveBeenNthCalledWith(1, expect.objectContaining({ to: [ticket.email] }), { idempotencyKey: `winner:${ticket.ticketId}` });
  expect(send.mock.calls[1][1]).toEqual(send.mock.calls[0][1]);
  const recipient = { ...ticket, registrantId: "507f1f77bcf86cd799439011" };
  await sendNonWinnerEmail(recipient);
  expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ to: [ticket.email] }), { idempotencyKey: `non-winner:${recipient.registrantId}:${ticket.date}` });
});
