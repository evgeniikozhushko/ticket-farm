# Beta Preview Validation

- Date: September 30, 2026
- Branch: `chore/beta-launch-readiness`
- Recorded branch revision: `7bb2253` (application baseline `94520b5`)
- Preview: `https://ticket-farm-git-chore-beta-la-8a459b-evgeniis-projects-797be76f.vercel.app`
- Preview database: `ticket_farm_preview`

## Decision

The core free-beta workflow passed in the isolated Vercel Preview environment:
onboarding, public registration, lottery draw, winner-email delivery, ticket
lookup, exactly-once check-in, participant history, and role enforcement all
worked end to end.

This is Preview evidence, not approval to promote to Production. Stripe and the
remaining scenarios listed below are intentionally outstanding.

No secret values, provider signing keys, Clerk user IDs, email addresses, or
private ticket References are recorded in this report.

## Environment and deployment evidence

- The Vercel project uses `main` as its Production branch. The launch branch
  produced a Ready Preview deployment at the stable branch URL above.
- Vercel Authentication remained enabled. A temporary share link and an
  automation bypass were used only to reach the protected Preview and its
  provider webhooks.
- Branch-specific Preview overrides were configured for MongoDB, Clerk,
  Turnstile, Resend, Inngest, `APP_URL`, and the platform-admin allowlist.
  Values were not copied into this report.
- MongoDB connected successfully to `ticket_farm_preview` with the restricted
  Preview application user. The connectivity check reported MongoDB 8.0.34,
  an empty organization set before onboarding, and successful verification of
  all required deployment indexes.
- The Preview used Clerk's Development instance, a dedicated Turnstile widget,
  a separate Resend sending key/webhook secret, and the launch branch's Inngest
  environment. Paid Stripe price IDs remained unset, as required for beta.
- The shared Production Clerk secret was restored after configuration review;
  no Production deployment occurred during Preview setup or validation.

## Completed validation

| Area | Result | Evidence |
| --- | --- | --- |
| Build and deployment | Passed | Vercel built the launch branch and reported the Preview deployment Ready. |
| Database | Passed | The Preview URI connected to `ticket_farm_preview`; the required index verifier passed. |
| Authentication and onboarding | Passed | A new Clerk Development user signed up, completed onboarding, created a test organization, and reached `/dashboard/lottery`. |
| Organization invitation | Passed | A second Clerk Development user accepted an organization invitation and entered the authenticated organization experience. |
| Public registration | Passed | The organization registration page loaded with the real Preview Turnstile widget and accepted a registration. |
| Duplicate registration | Passed | Repeating the same registration returned the ordinary success result while the dashboard count remained exactly one. |
| Lottery draw | Passed | One winner was selected from one registrant and the dashboard showed the lottery as drawn. |
| Inngest dispatch | Passed | `lottery/draw.completed` ran `send-winner-emails` successfully. The `recover-winner-email-dispatches` cron was present on `*/15 * * * *` and also completed successfully. |
| Inngest route boundary | Passed | A direct unsigned request passed Vercel protection, reached `/api/inngest`, and returned the expected `Unauthorized` response rather than a deployment-protection error. |
| Resend acceptance and delivery | Passed | The winner email was accepted and marked delivered. The `email.delivered` webhook reached the application once and received `200 OK` with `{"received":true}`. |
| Ticket lookup | Passed | Staff found the winner using the private Reference and saw the correct ticket, lottery date, and pickup details. |
| Exactly-once check-in | Passed | The first redemption succeeded. A repeated attempt reported that the ticket was already redeemed and preserved the original check-in timestamp. |
| Participant state | Passed | Participant History showed one entry, one win, zero active tickets, one checked-in ticket, and a sent email status. |
| Organization settings | Passed | The admin settings page rendered the organization identity, timezone, pickup details, sender branding, and free/trialing plan state. |
| Billing beta state | Passed | Billing showed the free plan, `1 / 100` daily usage, and paid plans as “Available after beta.” |
| Organization member permissions | Passed | A non-admin member could view lottery, registrant, winner Reference, and ticket lookup/check-in data, but had no settings or billing controls. Direct member requests to those pages redirected to the lottery dashboard. |
| Platform authorization | Passed | `/platform` returned 404 before the user was included in the Preview platform-admin allowlist, rendered for the configured platform admin after redeploy, and remained 404 for the ordinary organization member. |
| Private result routes | Passed | `/winners` and the organization winners route returned 404. A signed-out request to `/dashboard/lottery` required Clerk sign-in. |
| Public-page authority | Passed | Disabling the public registration page made the organization route return 404 immediately; re-enabling it made the next request render successfully. |
| Preview logs | Passed | A post-fix Vercel error-log check found no unhandled Preview errors during the validated workflow. |

The code baseline used for this launch branch had already passed 35 test files /
246 tests, lint, type checking, production build, and diff checks. Those code
checks were not rerun for this documentation-only evidence update.

## Still outstanding

### Preview scenarios

- Configure and verify the Stripe webhook with Stripe test-mode credentials.
  Confirm `/api/webhooks/stripe` returns 200 for a signed test event. Paid
  checkout remains intentionally unavailable until after beta.
- Run a bounced-email scenario and confirm the Resend `email.bounced` webhook
  updates the stored ticket/participant delivery outcome. Delivered-email
  handling is verified; bounce handling is not yet verified live.
- Create a second test organization and confirm that its staff cannot resolve
  or redeem a Reference issued by the first organization.
- Seed enough participant data to exercise multiple pages. Verify email search
  stays filtered across pages, name search works, and selected-participant
  history pagination remains bounded and correct.
- Perform the Atlas quota-change dry run: change a test organization from 100
  to 250 registrations/day, verify the next admission observes the new limit,
  then restore the original setting. Use a fresh organization/date because the
  validated test lottery is already drawn.

### Production readiness and promotion

- Review Production configuration independently from Preview: MongoDB database
  and indexes, `APP_URL`, Clerk, Turnstile keys/hostname, Inngest, Resend, Stripe
  test-mode configuration, and the platform-admin allowlist.
- Configure and verify the Production Resend webhook and its
  `RESEND_WEBHOOK_SECRET`; it was still missing at the last environment review.
- Confirm the shared Stripe credentials are test-mode credentials or replace
  them with correctly scoped values before enabling its Preview webhook.
- Promote only after all required checks in `BETA_DEPLOY_CHECKLIST.md` pass.
  Vercel rebuilds a promoted Preview with Production environment variables, so
  repeat the environment-dependent smoke tests after promotion.
- Verify `https://ticketfarm.ca`, onboarding, registration, draw/email,
  redemption, authorization, provider webhooks, and Production logs after the
  Production deployment.
- After QA is complete, review and revoke or rotate the temporary Preview share
  link and automation-bypass access. Keep normal Preview protection enabled.

## References

- Reusable procedure: [`BETA_DEPLOY_CHECKLIST.md`](../BETA_DEPLOY_CHECKLIST.md)
- Task record: [`tasks/todo.md`](../tasks/todo.md)
- Earlier audit baseline: [`production-readiness-2026-09-13.md`](production-readiness-2026-09-13.md)
