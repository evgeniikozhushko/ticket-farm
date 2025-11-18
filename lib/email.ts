import { Resend } from "resend";
import WinnerTicketEmail from "@/emails/winner-ticket-email";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailTicket {
  name: string;
  email: string;
  ticketNumber: number;
  ticketId: string;
  date: string;
  pickupTime: string;
}

export interface EmailResult {
  success: boolean;
  email: string;
  error?: string;
  messageId?: string;
}

/**
 * Send winner notification email to a single recipient
 */
export async function sendWinnerEmail(
  ticket: EmailTicket
): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: "Canmore Food Recovery <noreply@canmorefoodrecovery.com>",
      to: [ticket.email],
      subject: `You Won! Ticket #${ticket.ticketNumber} - Canmore Food Recovery`,
      react: WinnerTicketEmail({
        name: ticket.name,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.ticketId,
        date: ticket.date,
        pickupTime: ticket.pickupTime,
      }),
    });

    if (error) {
      console.error(`Failed to send email to ${ticket.email}:`, error);
      return {
        success: false,
        email: ticket.email,
        error: error.message,
      };
    }

    console.log(`Email sent successfully to ${ticket.email}, ID: ${data?.id}`);
    return {
      success: true,
      email: ticket.email,
      messageId: data?.id,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`Exception sending email to ${ticket.email}:`, errorMessage);
    return {
      success: false,
      email: ticket.email,
      error: errorMessage,
    };
  }
}

/**
 * Send winner notification emails to multiple recipients
 * Returns array of results for each email
 */
export async function sendBulkWinnerEmails(
  tickets: EmailTicket[]
): Promise<EmailResult[]> {
  console.log(`Sending emails to ${tickets.length} winners...`);

  // Send all emails in parallel
  const emailPromises = tickets.map((ticket) => sendWinnerEmail(ticket));
  const results = await Promise.allSettled(emailPromises);

  // Process results
  const emailResults: EmailResult[] = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      // Handle rejected promise
      return {
        success: false,
        email: tickets[index].email,
        error: result.reason?.message || "Promise rejected",
      };
    }
  });

  // Log summary
  const successCount = emailResults.filter((r) => r.success).length;
  const failureCount = emailResults.length - successCount;

  console.log(
    `Email sending complete: ${successCount} successful, ${failureCount} failed`
  );

  return emailResults;
}
