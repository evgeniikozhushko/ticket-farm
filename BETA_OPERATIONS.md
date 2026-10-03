# Attended beta operations

This is the procedure for the free private beta. Execution evidence belongs in the
dated release report. Writing this procedure does not establish that backups,
monitoring, provider controls, or a restore have been verified.

## Ownership and limits

The project owner must designate a primary operator and backup before inviting real
participants. Each needs appropriate Atlas, Vercel, Inngest, Resend, and Clerk access.
Record names, contact method, pilot hours, and the next review time in the private
operator record. Do not place credentials or participant information in this repo.

During an attended pilot, check before opening registration, after each draw, and
every 15 minutes while admissions or sends are active:

- Vercel application errors, registration failures, and webhook responses.
- Inngest failed runs, recovery cron execution, and pending/failed/sending recipients.
- Recipients marked uncertain or with exhausted attempts; reconcile their message IDs
  with Resend before any resend. Never reset uncertain recipients blindly.
- Atlas connection, disk, replication, and backup alerts; Resend usage and throttling.

Use 100 registrations per organization/day initially. A 250-entry increase requires
the recorded quota test and a capacity run for the candidate deployment. Do not
enable unlimited plans. Local timings do not establish Atlas/Vercel capacity or
delivery deadlines. Broader unattended operation requires independent outage alerts
and an operator who receives and responds to them.

## Pause and rollback

1. Identify environment, deployment ID/source revision, organization, and incident
   time. Record identifiers without participant addresses or private References.
2. For affected organizations, set MongoDB `organizations.publicPageEnabled` to false
   using a filter on `clerkOrgId`. Verify fresh public requests and a previously open
   form cannot admit registrations, and the registration/counter values stay fixed.
3. Pause the Inngest send and recovery functions in the affected environment; stop
   manual retries. Verify active runs finish or are canceled and no provider send
   remains in flight. Page disable alone does not stop email or authenticated draws.
4. Reconcile provider outcomes by recipient/message ID. Keep unknown sends uncertain;
   separate retryable failures from accepted/delivered/bounced outcomes.
5. Select a previously verified deployment and source revision. Confirm its schema,
   indexes, event payloads, and environment variables remain compatible with current
   data. Record the actual rollback target before release. Do not deploy a revision
   with known unresolved vulnerabilities just because it is older.
6. Perform rollback through the authorized release process. Verify health, isolation,
   webhooks, and job processing before resuming sends or admissions. A code rollback
   does not reverse database writes or messages already sent.

## Backup restore drill

1. Verify actual Atlas backup coverage, retention, latest successful snapshot, and
   least-privilege application access. Agree and record recovery-point and
   recovery-time targets with the operator; neither is established by this file.
2. Restore a snapshot into an isolated destination with restricted access. Keep
   restored admissions disabled and all email/event dispatch paused; do not point a
   running Production or Preview worker at the restored data.
3. Record snapshot time, restore start/end, and counts for organizations, lotteries,
   registrations, tickets, summaries, dispatches, and recipient records. Verify
   required indexes using the read-only database check, then compare counts and
   synthetic lookup results with the source. Preserve tenant boundaries and ticket
   status. Never send restored result emails as part of a drill.
4. Retain sanitized results and the measured recovery times in the operator record.
   Remove the isolated restore target through the provider's approved workflow after
   the evidence is retained. Confirm Production remained on its original database.

## Organization shutdown

1. Verify the request with an authorized organization admin; identify its Clerk org
   ID and the correct MongoDB environment. Inventory outstanding pickups, open draws,
   recipients, and provider jobs before choosing a shutdown time.
2. Disable MongoDB public admissions and follow the pause procedure above. Confirm
   old forms are rejected and counters do not advance. Arrange outstanding ticket
   fulfillment before removing records needed for pickup.
3. Cancel/drain all organization jobs in Inngest, including delayed events, manual
   retries and legacy events containing email payloads. Reconcile in-flight Resend
   sends. Keep the functions paused until cancellation and data work are complete.
4. Remove staff/organization identity access in Clerk only after public access and
   jobs are closed. Deleting a Clerk organization alone does not disable its public
   MongoDB page. Verify public access again after the identity change.
5. If deletion is authorized, inventory and remove organization-scoped records in
   `registrants`, `tickets`, `participant_summaries`, `lotteries`,
   `result_email_recipients`, `email_dispatches`, and `organizations`. Use reviewed
   filters on `orgId` (or `clerkOrgId` for organizations), inspect counts first, and
   execute related changes in a transaction where practical. Handle provider records
   separately. Record and honor any explicitly agreed retention requirement.
6. Verify no organization records, queued jobs, or accessible identity remain; verify
   an unrelated synthetic organization is intact. Do not resume canceled jobs.

## Participant data requests

1. Receive requests through `hello@ticketfarm.ca`. Verify control of the requesting
   email and the organization relationship through the authorized admin; collect only
   what is necessary to verify identity. Do not disclose another participant's data.
2. Record the scoped request and any retention/fulfillment requirement privately.
   For export, include scoped registrations, tickets, and their outcomes; use an
   agreed private delivery method after checking the requester and destination.
3. For deletion, disable affected organization admissions and pause/drain jobs first.
   Inventory by normalized email and `orgId`; also trace ticket IDs, registrant IDs,
   recipient snapshots, and both durable and legacy dispatch payloads. Provider
   history and logs are outside MongoDB and need their own handling.
4. Finish/cancel outstanding pickups with the admin. Cancel queued Inngest events
   containing the person's data, including legacy payloads, before removing database
   snapshots. Otherwise a queued legacy event can send or recreate removed data.
5. Review and remove the person's registrations, tickets, participant summary, and
   matching recipient records. Redact matching embedded recipients in retained
   dispatch snapshots. Remove deleted registrant IDs from lottery winner lists;
   preserve committed admission counters as historical admission totals. Do not
   reopen drawn dates or recalculate already allocated winners.
6. Request provider deletion/redaction where supported and document any provider
   retention limits. Security rate-limit keys expire after their TTL; they contain
   hashes rather than cleartext addresses. Logs and backups may retain prior data
   until their configured retention expires. Keep a restricted deletion ledger so a
   later restore reapplies requests before admissions/jobs resume; do not claim that
   live deletion erases old snapshots immediately.
7. Verify the participant is absent from directory/history/ticket lookup and queued
   payloads, unrelated participants are intact, and retry/recovery cannot recreate
   or send their data. Record results, then resume unaffected processing and reply
   privately to the requester with the completed action and remaining retention.

Demonstrate shutdown and a synthetic deletion request in the isolated Preview
environment before real participant onboarding. Record the provider cancellation,
lookup, and unrelated-organization checks; automated DB tests alone do not prove
provider cancellation or backup retention.
