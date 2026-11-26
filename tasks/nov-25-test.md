Use the same workflow you used for the two-person test. This time you’ll enter 12 test recipients, including one whose email is designed to bounce. Your two-person test is already complete.

### 1. Start with an empty Preview draw

Open the Preview lottery dashboard. Use a test organization with 0 registrants and an open draw. Ticket Farm allows one draw per organization per local day. If your two-person draw was today, use another isolated Preview test organization or wait until tomorrow.

### 2. Register 12 test recipients

Open that organization’s public registration page on the same Preview hostname. Its path is /<org-slug>. Submit the form once for each person, using names QA 01 through QA 12.

| People | Email to enter |
|---|---|
| QA 01 through QA 11 | delivered+pr13-01@resend.dev through delivered+pr13-11@resend.dev, changing the number each time |
| QA 12 | bounced+pr13-12@resend.dev |

These are Resend’s test addresses, so you don’t need 12 inboxes. Resend test address guide

### 3. Draw all 12 and check the result

Refresh the lottery dashboard and confirm it shows exactly 12 registrants. Set Number of Winners to 12 and click Run Lottery Draw once. Note the time.

- Inngest: In the Preview branch, open the newest send-winner-emails run. Look for three result-email-batch-* steps. The completion output should show 12 sent, 0 skipped, 0 failed, 0 uncertain. Save the run ID. Preview runs
- Resend: Under Emails, confirm one message for each of the 12 addresses. Under Webhooks, open the Preview endpoint and check that an email.delivered event and the email.bounced event each received HTTP 200.
- Ticket Farm: Refresh the winner panel. QA 12 should show a delivery problem. Seeing 12 sent in Inngest is expected because Resend accepted all 12 messages before reporting the bounce.

### 4. Rerun the email job once

Open that 12-person Inngest run and click Rerun, just as you did before. Open the new Run ID and check its output. Expect 0 sent, 12 skipped, 0 failed, 0 uncertain. Resend should still show only the original 12 messages for these addresses.

Send me: the two run IDs and outputs, whether you saw three batches, the two webhook HTTP statuses, whether QA 12 was flagged, and the final Resend message count.