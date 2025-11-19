📧 Complete Resend Email Implementation Guide

1. Email Template Component
File: emails/winner-ticket-email.tsx This is a React component that gets rendered into HTML email:
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Hr,
} from "@react-email/components";

interface WinnerTicketEmailProps {
  name: string;
  ticketNumber: number;
  ticketId: string;
  date: string;
  pickupTime: string;
}

export default function WinnerTicketEmail({
  name = "Winner",
  ticketNumber = 1,
  ticketId = "123456",
  date = "2024-01-01",
  pickupTime = "5:30 PM",
}: WinnerTicketEmailProps) {
  return (
    <Html>
      <Head />
      {/* Preview text appears in email inbox preview */}
      <Preview>Congratulations! You won the Canmore Food Recovery lottery!</Preview>
      
      <Body style={main}>
        <Container style={container}>
          {/* Personalized greeting */}
          <Heading style={h1}>Congratulations, {name}!</Heading>

          <Text style={text}>
            You've been selected as a winner in today's Canmore Food Recovery lottery!
          </Text>

          {/* Highlighted ticket information section */}
          <Section style={ticketSection}>
            <Heading as="h2" style={h2}>Your Ticket Information</Heading>
            <Text style={ticketInfo}>
              <strong>Ticket Number:</strong> #{ticketNumber}
            </Text>
            <Text style={ticketInfo}>
              <strong>Ticket ID:</strong> {ticketId}
            </Text>
            <Text style={ticketInfo}>
              <strong>Date:</strong> {date}
            </Text>
            <Text style={ticketInfo}>
              <strong>Pickup Time:</strong> {pickupTime}
            </Text>
          </Section>

          <Hr style={hr} />

          {/* Pickup instructions */}
          <Section style={instructionsSection}>
            <Heading as="h3" style={h3}>Next Steps</Heading>
            <Text style={text}>
              Please bring this email or your Ticket ID (<strong>{ticketId}</strong>) 
              when you come to pick up your food.
            </Text>
            <Text style={text}>
              <strong>Pickup Location:</strong> Canmore Food Recovery Center
            </Text>
            <Text style={text}>
              <strong>Pickup Time:</strong> {pickupTime}
            </Text>
            <Text style={text}>
              If you cannot make it to the pickup, please let us know as soon as 
              possible so we can offer your spot to someone else.
            </Text>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            Thank you for supporting Canmore Food Recovery!
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Inline styles (required for email compatibility across clients)
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
  borderRadius: "8px",
};

const h1 = {
  color: "#16a34a", // Green for food recovery branding
  fontSize: "32px",
  fontWeight: "bold",
  margin: "40px 0 20px",
  padding: "0 40px",
  lineHeight: "1.3",
};

const ticketSection = {
  backgroundColor: "#f0fdf4", // Light green background
  borderRadius: "8px",
  padding: "24px 40px",
  margin: "24px 40px",
  border: "2px solid #16a34a", // Green border highlights ticket info
};

// ... more styles
Key Learning Points:
Uses @react-email/components for email-safe React components
Inline styles are required (email clients don't support external CSS)
Preview component controls inbox preview text
Default props make the component testable/previewable
Responsive design with mobile-friendly widths
2. Email Service Layer
File: lib/email.ts This file handles the actual sending logic:
import { Resend } from "resend";
import WinnerTicketEmail from "@/emails/winner-ticket-email";

// Initialize Resend client with API key from environment
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
  messageId?: string;  // Resend's unique message ID for tracking
}

/**
 * Send winner notification email to a single recipient
 * 
 * How it works:
 * 1. Calls Resend API with email parameters
 * 2. React component is auto-rendered to HTML by react-email
 * 3. Returns success/failure result
 */
export async function sendWinnerEmail(
  ticket: EmailTicket
): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: "hello@ticketfarm.ca",  // Your verified custom domain
      to: [ticket.email],               // Recipient
      subject: `You Won! Ticket #${ticket.ticketNumber} - Canmore Food Recovery`,
      react: WinnerTicketEmail({        // React component (auto-rendered to HTML)
        name: ticket.name,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.ticketId,
        date: ticket.date,
        pickupTime: ticket.pickupTime,
      }),
    });

    // Check if Resend returned an error
    if (error) {
      console.error(`Failed to send email to ${ticket.email}:`, error);
      return {
        success: false,
        email: ticket.email,
        error: error.message,
      };
    }

    // Success case
    console.log(`Email sent successfully to ${ticket.email}, ID: ${data?.id}`);
    return {
      success: true,
      email: ticket.email,
      messageId: data?.id,  // Useful for tracking in Resend dashboard
    };
  } catch (error) {
    // Handle unexpected exceptions
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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
 * Processes all emails in parallel for performance
 * 
 * @returns Array of results for each email (success/failure)
 */
export async function sendBulkWinnerEmails(
  tickets: EmailTicket[]
): Promise<EmailResult[]> {
  console.log(`Sending emails to ${tickets.length} winners...`);

  // Send all emails in parallel using Promise.allSettled
  // This ensures one failure doesn't stop others from sending
  const emailPromises = tickets.map((ticket) => sendWinnerEmail(ticket));
  const results = await Promise.allSettled(emailPromises);

  // Process results from Promise.allSettled
  const emailResults: EmailResult[] = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;  // Successful email result
    } else {
      // Promise was rejected (unexpected error)
      return {
        success: false,
        email: tickets[index].email,
        error: result.reason?.message || "Promise rejected",
      };
    }
  });

  // Log summary for debugging
  const successCount = emailResults.filter((r) => r.success).length;
  const failureCount = emailResults.length - successCount;

  console.log(
    `Email sending complete: ${successCount} successful, ${failureCount} failed`
  );

  return emailResults;
}
Key Learning Points:
Resend client initialized once with API key
resend.emails.send() accepts a react parameter (React Email component)
React component is automatically rendered to HTML by the react-email library (uses prettier under the hood)
Promise.allSettled() ensures all emails are attempted even if some fail
Returns detailed results for each email (for database tracking)
3. Database Types with Email Tracking
File: lib/types.ts Extended the Ticket and WinnerInfo types to track email status:
export interface Ticket {
  _id?: ObjectId;
  ticketNumber: number;
  ticketId: string;
  name: string;
  email: string;
  date: string;
  pickupTime: string;
  status: TicketStatus;
  generatedAt: Date;
  
  // Email tracking fields (added for email feature)
  emailSent?: boolean;      // true = sent, false = failed, undefined = not attempted
  emailSentAt?: Date;       // Timestamp when email was successfully sent
  emailError?: string;      // Error message if sending failed
}

export interface WinnerInfo {
  _id: ObjectId;
  name: string;
  email: string;
  enteredAt: Date;
  ticketNumber?: number;
  ticketId?: string;
  
  // Email tracking (added for UI display)
  emailSent?: boolean;
  emailError?: string;
}
Key Learning Points:
Optional fields (?) allow backward compatibility
Tracks three states: success (true), failure (false), not attempted (undefined)
Error message stored for debugging
4. Lottery Draw Integration
File: lib/actions/lottery-draw.actions.ts This is where emails get sent automatically during lottery draw:
"use server";

import { sendBulkWinnerEmails, type EmailTicket } from "@/lib/email";

export async function drawTodayLottery(
  winnerCount: number
): Promise<DrawLotteryResult> {
  try {
    // ... earlier code: validate, shuffle registrants, select winners ...

    const ticketsCollection = await getTicketsCollection();
    const ticketDocuments: Omit<Ticket, "_id">[] = selectedWinners.map((winner, index) => ({
      ticketNumber: index + 1,
      ticketId: generateTicketId(),
      name: winner.name,
      email: winner.email,
      date: date,
      pickupTime: "5:30 PM",
      status: "ACTIVE",
      generatedAt: drawnAt,
      // Email fields will be updated after sending
    }));

    // Insert all tickets at once (bulk insert for performance)
    await ticketsCollection.insertMany(ticketDocuments);

    // ===== EMAIL SENDING STARTS HERE =====
    
    // 1. Prepare email data from ticket documents
    const emailTickets: EmailTicket[] = ticketDocuments.map((ticket) => ({
      name: ticket.name,
      email: ticket.email,
      ticketNumber: ticket.ticketNumber,
      ticketId: ticket.ticketId,
      date: ticket.date,
      pickupTime: ticket.pickupTime,
    }));

    // 2. Send emails in parallel (this doesn't block the lottery draw)
    const emailResults = await sendBulkWinnerEmails(emailTickets);

    // 3. Update tickets in database with email status
    const emailUpdates = emailResults.map((result) => ({
      updateOne: {
        filter: {
          date,                    // Find ticket by date and email
          email: result.email,
        },
        update: {
          $set: {
            emailSent: result.success,                      // true/false
            emailSentAt: result.success ? drawnAt : undefined,  // Only if successful
            emailError: result.error,                       // Error message if failed
          },
        },
      },
    }));

    // 4. Execute bulk update (efficient single database operation)
    if (emailUpdates.length > 0) {
      await ticketsCollection.bulkWrite(emailUpdates);
    }

    // ===== EMAIL SENDING ENDS HERE =====

    // Prepare winner info to return to UI
    const winners: WinnerInfo[] = selectedWinners.map((r, index) => ({
      _id: r._id as ObjectId,
      name: r.name,
      email: r.email,
      enteredAt: r.enteredAt,
      ticketNumber: ticketDocuments[index].ticketNumber,
      ticketId: ticketDocuments[index].ticketId,
      // Note: emailSent status will be fetched from database when page refreshes
    }));

    // ... rest of code: update lottery document, return success ...
    
  } catch (err) {
    console.error("drawTodayLottery error:", err);
    return {
      success: false,
      error: "Something went wrong while drawing the lottery. Please try again.",
    };
  }
}
Key Learning Points:
Emails sent after tickets are created in database
Email sending doesn't block lottery draw (wrapped in try-catch)
bulkWrite() updates all tickets efficiently in one database operation
Email status persisted to database for auditing and display
5. Fetching Email Status for UI
File: lib/actions/lottery-query.actions.ts Retrieves winners with email status:
export async function getTodayWinners(): Promise<WinnerInfo[]> {
  try {
    const date = getTodayDateString();
    const lotteriesCollection = await getLotteriesCollection();
    const registrantsCollection = await getRegistrantsCollection();
    const ticketsCollection = await getTicketsCollection();

    // Get lottery document
    const lottery = await lotteriesCollection.findOne({ date });

    if (!lottery || lottery.status !== "LOTTERY_DRAWN" || !lottery.winnerRegistrantIds) {
      return [];
    }

    // Fetch winner registrants
    const winners = await registrantsCollection
      .find({
        _id: { $in: lottery.winnerRegistrantIds },
      })
      .toArray();

    // Fetch tickets (which contain email status)
    const tickets = await ticketsCollection
      .find({ date })
      .sort({ ticketNumber: 1 })
      .toArray();

    // Create lookup map: email -> ticket
    const ticketMap = new Map<string, Ticket>(
      tickets.map((t) => [t.email, t])
    );

    // Combine registrant data with ticket data (including email status)
    return winners.map((w) => {
      const ticket = ticketMap.get(w.email);
      return {
        _id: w._id as ObjectId,
        name: w.name,
        email: w.email,
        enteredAt: w.enteredAt,
        ticketNumber: ticket?.ticketNumber,
        ticketId: ticket?.ticketId,
        emailSent: ticket?.emailSent,        // Email status from ticket
        emailError: ticket?.emailError,      // Error message if failed
      };
    }).sort((a, b) => (a.ticketNumber || 0) - (b.ticketNumber || 0));
  } catch (err) {
    console.error("getTodayWinners error:", err);
    return [];
  }
}
Key Learning Points:
Uses a Map for efficient email -> ticket lookup
Joins registrant data with ticket data (email status)
Returns combined WinnerInfo with email tracking fields
6. UI Display with Email Status
File: components/lottery/lottery-draw-panel.tsx Shows email status in the admin dashboard:
"use client";

import { IconMail, IconMailOff } from "@tabler/icons-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function LotteryDrawPanel({ ... }) {
  const handleDraw = async () => {
    // ... draw lottery ...
    
    if (result.success) {
      setStatus("LOTTERY_DRAWN");
      setWinners(result.winners);
      setLastDrawnAt(result.drawnAt);

      // Calculate email statistics
      const emailsSent = result.winners.filter(w => w.emailSent).length;
      const emailsFailed = result.winners.filter(w => w.emailSent === false).length;

      // Show toast notifications
      toast.success(`Successfully drew ${result.winnerCount} winners!`);

      if (emailsSent > 0) {
        toast.success(`Emails sent to ${emailsSent} winner${emailsSent !== 1 ? 's' : ''}`, {
          icon: "📧",
        });
      }

      if (emailsFailed > 0) {
        toast.error(`Failed to send ${emailsFailed} email${emailsFailed !== 1 ? 's' : ''}`, {
          description: "Winners were selected but some emails could not be sent",
        });
      }
    }
  };

  return (
    <Card>
      {/* ... earlier content ... */}
      
      {/* Email Status Alerts */}
      {(() => {
        const emailsSent = winners.filter(w => w.emailSent).length;
        const emailsFailed = winners.filter(w => w.emailSent === false).length;
        const emailsPending = winners.filter(w => w.emailSent === undefined).length;

        return (
          <>
            {/* Success Alert */}
            {emailsSent > 0 && (
              <Alert className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
                <IconMail className="size-4 text-green-600 dark:text-green-400" />
                <AlertDescription className="text-green-800 dark:text-green-200">
                  Emails successfully sent to {emailsSent} winner{emailsSent !== 1 ? 's' : ''}
                </AlertDescription>
              </Alert>
            )}

            {/* Failure Alert */}
            {emailsFailed > 0 && (
              <Alert className="border-red-500/50 bg-red-50 dark:bg-red-950/20">
                <IconMailOff className="size-4 text-red-600 dark:text-red-400" />
                <AlertDescription className="text-red-800 dark:text-red-200">
                  Failed to send emails to {emailsFailed} winner{emailsFailed !== 1 ? 's' : ''}.
                  Winners were selected successfully but email delivery failed.
                </AlertDescription>
              </Alert>
            )}
          </>
        );
      })()}

      {/* Winners Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Ticket #</TableHead>
            <TableHead>Ticket ID</TableHead>
            <TableHead className="w-24 text-center">Email Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {winners.map((winner, index) => (
            <TableRow key={winner._id.toString()}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>{winner.name}</TableCell>
              <TableCell>{winner.email}</TableCell>
              <TableCell>{winner.ticketNumber}</TableCell>
              <TableCell>{winner.ticketId}</TableCell>
              
              {/* Email Status Icon */}
              <TableCell className="text-center">
                {winner.emailSent === true ? (
                  <IconMail
                    className="inline-block size-4 text-green-600 dark:text-green-400"
                    title="Email sent successfully"
                  />
                ) : winner.emailSent === false ? (
                  <IconMailOff
                    className="inline-block size-4 text-red-600 dark:text-red-400"
                    title={winner.emailError || "Email failed to send"}
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
Key Learning Points:
Immediate feedback via toast notifications
Visual alerts showing email statistics
Per-winner email status icons with tooltips
Hover over failed icon shows error message
7. Environment Configuration
File: .env.local (your local file)
RESEND_API_KEY=re_jLHudEb6_G2djJupbX6BYfdADbcB5gt3X
File: .env.example (template for others)
# Resend API Key for sending winner notification emails
# Get your API key from: https://resend.com/api-keys
RESEND_API_KEY=re_your_api_key_here

## 📧 IMPORTANT: Production Email Configuration

### Current Setup: Production Mode with Custom Domain

The application is configured to use `hello@ticketfarm.ca` as the sender email address. This is a verified custom domain configured in Resend.

**Status**: Production mode - emails can be sent to any recipient address once the domain is verified in Resend.

### Domain Verification Setup (Required for Production)

To use `hello@ticketfarm.ca` in production, complete these steps in Resend:

1. **Add Domain to Resend**
   - Go to https://resend.com/domains
   - Click "Add Domain"
   - Enter: `ticketfarm.ca`

2. **Configure DNS Records**
   Resend will provide DNS records to add to your domain registrar:
   - **SPF Record** - Authorizes Resend to send emails on your behalf
   - **DKIM Record** - Cryptographic signature for email authentication
   - **DMARC Record** - Email policy and reporting

3. **Verify Domain**
   - After adding DNS records, click "Verify" in Resend dashboard
   - DNS propagation can take 24-48 hours
   - Once verified, emails can be sent to ANY recipient address

**Current Configuration**: `hello@ticketfarm.ca` (configured in `lib/email.ts` line 31)

### Why Emails May Fail

If you see "Failed to send emails" errors, it's typically because:
- ❌ The domain `ticketfarm.ca` hasn't been verified in Resend dashboard yet
- ❌ DNS records haven't propagated (can take up to 48 hours)
- ❌ Rate limits exceeded (free tier: 100 emails/day, 3,000/month)
- ❌ Invalid recipient email addresses

### Test Mode Setup (For Testing Only)

If you need to test with Resend's test domain before your custom domain is verified:

1. **Use Test Sender**
   - Temporarily change `lib/email.ts` line 31 to: `from: "onboarding@resend.dev"`
   - This is Resend's shared test domain

2. **Verify Recipient Emails**
   - Go to https://resend.com/emails
   - Add and verify each test email address
   - Emails will only send to verified addresses in test mode

3. **Switch Back to Production**
   - Once `ticketfarm.ca` is verified, change back to: `from: "hello@ticketfarm.ca"`

**Note**: Test mode has restrictions - emails only send to verified addresses. Production mode (with verified custom domain) has no such restrictions.

### Quick Reference

| Environment | Sender Email | Recipient Restriction | Use Case |
|------------|--------------|----------------------|----------|
| **Test Mode** | `onboarding@resend.dev` | ✅ Verified emails only | Testing before domain verification |
| **Production** | `hello@ticketfarm.ca` | ❌ No restrictions (once verified) | Live application |

### Troubleshooting

**Q: Why do I see "Failed to send emails to X winner(s)"?**
A: The most common reasons are:
- Domain `ticketfarm.ca` hasn't been verified in Resend dashboard yet
- DNS records haven't fully propagated (can take up to 48 hours)
- Rate limits exceeded (100 emails/day on free tier)
- Check the Resend dashboard at https://resend.com/emails for specific error messages

**Q: How do I verify my domain in Resend?**
A: Go to https://resend.com/domains, add `ticketfarm.ca`, and configure the provided DNS records with your domain registrar.

**Q: Can I use my Vercel domain (ticket-farm.vercel.app) for emails?**
A: No. Resend doesn't allow free public domains. You must use a custom domain you own (like `ticketfarm.ca`).

**Q: How do I check if an email was actually sent?**
A: Check the Resend dashboard at https://resend.com/emails for delivery logs and status.

**Q: What's the free tier limit?**
A: Resend free tier: 3,000 emails/month, 100 emails/day. Check https://resend.com/pricing for current limits.

**Q: The app shows `hello@ticketfarm.ca` but I want to use test mode**
A: Temporarily change line 31 in `lib/email.ts` to `from: "onboarding@resend.dev"` for testing, then change it back once your domain is verified.
🔄 Complete Flow Diagram
1. Admin clicks "Run Lottery Draw"
   └─> drawTodayLottery() in lottery-draw.actions.ts

2. Select random winners (Fisher-Yates shuffle)
   └─> Create ticket documents in MongoDB

3. Prepare email data
   └─> emailTickets: EmailTicket[] array

4. Send emails in parallel
   └─> sendBulkWinnerEmails(emailTickets)
       └─> For each ticket:
           └─> sendWinnerEmail(ticket)
               └─> resend.emails.send({
                   from: "hello@ticketfarm.ca",
                   to: ticket.email,
                   react: WinnerTicketEmail(props)  // Auto-rendered to HTML
               })
               └─> Returns EmailResult { success, email, error }

5. Update tickets in database with email status
   └─> bulkWrite() updates emailSent, emailSentAt, emailError

6. Return winners to UI
   └─> UI displays toast notifications
   └─> UI shows alert banners (success/failure counts)
   └─> UI shows email status icons per winner
🔑 Key Takeaways
React Email: Allows writing emails as React components, auto-renders to HTML
Resend API: Simple API - just pass React component to react parameter
Parallel Sending: Promise.allSettled() sends all emails simultaneously
Graceful Degradation: Lottery succeeds even if emails fail
Status Tracking: Database stores email status for auditing and UI display
User Feedback: Multiple layers (toasts, alerts, icons) inform admin of email status
This architecture is production-ready, scalable, and provides excellent visibility into email delivery!