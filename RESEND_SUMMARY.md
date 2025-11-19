# Resend Email Service - Usage Summary

## Overview

Resend is used to send automated winner notification emails when a lottery draw is completed. The app sends personalized emails to winners containing their ticket information and pickup details.

## Setup

**Environment Variable:**
```bash
RESEND_API_KEY=re_your_api_key_here
```

**Dependencies:**
- `resend` - Email API client
- `@react-email/components` - React components for email templates
- `react-email` - Renders React components to HTML

## Core Implementation

### 1. Resend Client Initialization

**File:** `lib/email.ts`

```typescript
import { Resend } from "resend";
import WinnerTicketEmail from "@/emails/winner-ticket-email";

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);
```

### 2. Single Email Sending

**File:** `lib/email.ts`

```typescript
export async function sendWinnerEmail(
  ticket: EmailTicket
): Promise<EmailResult> {
  try {
    const { data, error } = await resend.emails.send({
      from: "hello@ticketfarm.ca",
      to: [ticket.email],
      subject: `Congrats! Your ticket #${ticket.ticketNumber} - Canmore Food Recovery`,
      react: WinnerTicketEmail({
        name: ticket.name,
        ticketNumber: ticket.ticketNumber,
        ticketId: ticket.ticketId,
        date: ticket.date,
        pickupTime: ticket.pickupTime,
      }),
    });

    if (error) {
      return {
        success: false,
        email: ticket.email,
        error: error.message,
      };
    }

    return {
      success: true,
      email: ticket.email,
      messageId: data?.id,
    };
  } catch (error) {
    return {
      success: false,
      email: ticket.email,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
```

### 3. Bulk Email Sending

**File:** `lib/email.ts`

```typescript
export async function sendBulkWinnerEmails(
  tickets: EmailTicket[]
): Promise<EmailResult[]> {
  // Send all emails in parallel
  const emailPromises = tickets.map((ticket) => sendWinnerEmail(ticket));
  const results = await Promise.allSettled(emailPromises);

  // Process results
  const emailResults: EmailResult[] = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      return {
        success: false,
        email: tickets[index].email,
        error: result.reason?.message || "Promise rejected",
      };
    }
  });

  return emailResults;
}
```

### 4. React Email Template

**File:** `emails/winner-ticket-email.tsx`

```typescript
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

export default function WinnerTicketEmail({
  name,
  ticketNumber,
  ticketId,
  date,
  pickupTime,
}: WinnerTicketEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Success! Your Canmore Food Recovery ticket is confirmed.</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Congratulations, {name}!</Heading>
          
          <Text style={text}>
            Your Canmore Food Recovery ticket has been confirmed for today.
          </Text>

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
          
          {/* More sections... */}
        </Container>
      </Body>
    </Html>
  );
}
```

### 5. Integration in Lottery Draw

**File:** `lib/actions/lottery-draw.actions.ts`

```typescript
import { sendBulkWinnerEmails, type EmailTicket } from "@/lib/email";

export async function drawTodayLottery(winnerCount: number) {
  // ... create tickets ...
  
  // Prepare email data
  const emailTickets: EmailTicket[] = ticketDocuments.map((ticket) => ({
    name: ticket.name,
    email: ticket.email,
    ticketNumber: ticket.ticketNumber,
    ticketId: ticket.ticketId,
    date: ticket.date,
    pickupTime: ticket.pickupTime,
  }));

  // Send emails in parallel
  const emailResults = await sendBulkWinnerEmails(emailTickets);

  // Update tickets with email status
  const emailUpdates = emailResults.map((result) => ({
    updateOne: {
      filter: { date, email: result.email },
      update: {
        $set: {
          emailSent: result.success,
          emailSentAt: result.success ? drawnAt : undefined,
          emailError: result.error,
        },
      },
    },
  }));

  await ticketsCollection.bulkWrite(emailUpdates);
}
```

## Key Features

1. **React Email Integration**
   - Write emails as React components
   - Automatically rendered to HTML by Resend
   - Inline styles required for email client compatibility

2. **Parallel Bulk Sending**
   - Uses `Promise.allSettled()` to send all emails simultaneously
   - One failure doesn't block other emails
   - Returns detailed results for each email

3. **Error Handling**
   - Graceful error handling with try-catch
   - Error messages stored in database
   - Lottery draw succeeds even if emails fail

4. **Status Tracking**
   - Email status (`emailSent`, `emailSentAt`, `emailError`) stored in database
   - UI displays email status icons and alerts
   - Toast notifications show success/failure counts

5. **Custom Domain**
   - Uses verified domain: `hello@ticketfarm.ca`
   - Requires domain verification in Resend dashboard
   - DNS records (SPF, DKIM, DMARC) must be configured

## Data Types

```typescript
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
```

