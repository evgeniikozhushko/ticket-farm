import { Resend } from "resend";
import WinnerTicketEmail from "@/emails/winner-ticket-email";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTicket {
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

export async function sendWinnerEmail(ticket: EmailTicket): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: `${ticket.emailFromName} <${ticket.emailFromAddress}>`,
      to: [ticket.email],
      subject: `Congrats! Your ticket #${ticket.ticketNumber} - ${ticket.orgName}`,
      react: WinnerTicketEmail({
        name: ticket.name,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.ticketId,
        date: ticket.date,
        pickupTime: ticket.pickupTime,
        orgName: ticket.orgName,
        pickupLocation: ticket.pickupLocation,
      }),
    });

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

  const results = await Promise.allSettled(tickets.map(sendWinnerEmail));

  const emailResults: EmailResult[] = results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      success: false,
      email: tickets[index].email,
      error: result.reason?.message || "Promise rejected",
    };
  });

  const successCount = emailResults.filter((r) => r.success).length;
  console.log(`Email sending complete: ${successCount}/${emailResults.length} successful`);

  return emailResults;
}
