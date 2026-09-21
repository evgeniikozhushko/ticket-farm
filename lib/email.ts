import { Resend } from "resend";
import WinnerTicketEmail from "@/emails/winner-ticket-email";
import NonWinnerEmailTemplate from "@/emails/non-winner-email";
import { waitForResultEmailSendSlot } from "@/lib/email-send-pace";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTicket {
  recipientRecordId?: string;
  name: string;
  email: string;
  ticketNumber: number;
  ticketId: string;
  date: string;
  pickupTime: string;
  // Org branding
  orgName: string;
  pickupLocation?: string;
  emailFromAddress: string;
  emailFromName: string;
}

export interface EmailResult {
  success: boolean;
  email: string;
  error?: string;
  messageId?: string;
}

export interface NonWinnerEmail {
  recipientRecordId?: string;
  registrantId: string;
  email: string;
  date: string;
  orgName: string;
  emailFromAddress: string;
  emailFromName: string;
}

export async function sendNonWinnerEmail(recipient: NonWinnerEmail): Promise<EmailResult> {
  try {
    await waitForResultEmailSendSlot();
    const { data, error } = await resend.emails.send({
      from: `${recipient.emailFromName} <${recipient.emailFromAddress}>`,
      to: [recipient.email],
      subject: `Your lottery result | ${recipient.orgName}`,
      react: NonWinnerEmailTemplate(recipient),
      ...(recipient.recipientRecordId ? { tags: [{ name: "tf_recipient", value: recipient.recipientRecordId }] } : {}),
    }, { idempotencyKey: `non-winner:${recipient.registrantId}:${recipient.date}` });
    return error
      ? { success: false, email: recipient.email, error: error.message }
      : { success: true, email: recipient.email, messageId: data?.id };
  } catch (error) {
    return { success: false, email: recipient.email, error: error instanceof Error ? error.message : "Email send failed." };
  }
}

export async function sendWinnerEmail(ticket: EmailTicket): Promise<EmailResult> {
  try {
    await waitForResultEmailSendSlot();
    const { data, error } = await resend.emails.send({
      from: `${ticket.emailFromName} <${ticket.emailFromAddress}>`,
      to: [ticket.email],
      subject: `Your ticket is ready — Ticket #${ticket.ticketNumber} | ${ticket.orgName}`,
      react: WinnerTicketEmail({
        name: ticket.name,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.ticketId,
        date: ticket.date,
        pickupTime: ticket.pickupTime,
        orgName: ticket.orgName,
        pickupLocation: ticket.pickupLocation,
      }),
      ...(ticket.recipientRecordId ? { tags: [{ name: "tf_recipient", value: ticket.recipientRecordId }] } : {}),
    }, { idempotencyKey: `winner:${ticket.ticketId}` });

    if (error) {
      console.error(`Failed to send email to ${ticket.email}:`, error);
      return { success: false, email: ticket.email, error: error.message };
    }

    return { success: true, email: ticket.email, messageId: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`Exception sending email to ${ticket.email}:`, message);
    return { success: false, email: ticket.email, error: message };
  }
}

export async function sendBulkWinnerEmails(tickets: EmailTicket[]): Promise<EmailResult[]> {
  console.log(`Sending emails to ${tickets.length} winners...`);
  const emailResults: EmailResult[] = [];
  for (const ticket of tickets) {
    emailResults.push(await sendWinnerEmail(ticket));
  }

  const successCount = emailResults.filter((r) => r.success).length;
  console.log(`Email sending complete: ${successCount}/${emailResults.length} successful`);

  return emailResults;
}
