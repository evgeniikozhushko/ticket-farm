# Ticket Farm production-readiness audit

Date: September 13, 2026. Reviewed revision: `bd27c18` (`Implemented the pickup preview mobile refresh.`). The worktree was clean when the audit began.

Follow-up: the P0 dependency remediation has been implemented locally; see [security remediation and verification](security-remediation-2026-09-13.md). The findings below preserve the original audit baseline. The fix is not yet deployed, and the other launch blockers remain open.

## Launch decision

**Do not open this revision to an unrestricted public launch yet. Do not enable paid subscriptions yet.** The application builds successfully and has useful security and reliability foundations, but it has concrete gaps affecting admission fairness, winner notifications, ticket confidentiality, and billing correctness. Its locked authentication and framework dependencies also have published security advisories.

A small, supervised free pilot is a reasonable next milestone after the security, registration, email, and disclosure issues below are addressed and the production service configuration is verified. Paid billing and large-volume usage need additional work. This assessment does not mean a rewrite is necessary: most problems sit in identifiable boundaries around otherwise useful existing code.

Priority definitions: P0 = patch before further public exposure; P1 = launch blocker for the affected workflow; P2 = address before scale or soon after a tightly controlled pilot. Severity is an engineering judgment about this application; registry severity is reported separately.

## Scope and evidence

Reviewed server actions, public and authenticated routes, Clerk authorization, MongoDB indexes and transactions, Stripe checkout and webhooks, Inngest dispatch/recovery, Resend delivery, organization caching/settings, participant queries, registration and billing UI, email templates, dependency lockfile, tests, and deployment documentation.

| Check | Result | What this establishes |
| --- | --- | --- |
| `pnpm test` | 20 files, 100 tests passed | Existing unit/mocked behavior passes |
| `pnpm lint` | Passed | No lint failures; nonblocking stale browser-data warning |
| `pnpm exec tsc --noEmit --incremental false` | Passed | Type checking passes |
| `pnpm build` | Passed with Next.js 16.2.6/Turbopack | Production compilation, type checking, and prerendering succeed |
| `pnpm audit --prod --json` | 87 reported vulnerabilities: 6 critical, 50 high, 30 moderate, 1 low | Dependency advisory matches; not 87 proven application exploits |
| `HEAD https://ticketfarm.ca` | HTTP 200, Vercel, HSTS present | Public landing page is reachable over HTTPS |
| Unauthenticated `HEAD /dashboard/lottery` | HTTP 404 with Clerk `protect-rewrite` and signed-out headers | This request was blocked; does not establish browser redirect UX or resistance to crafted requests |
| Read-only configured MongoDB topology/index inspection | Failed with DNS `ENOTFOUND`, including outside the sandbox | Indexes/topology remain unverified; this does not establish a production outage |

The vulnerability response contains 85 advisory entries; some cover multiple installed versions. See [the dependency audit appendix](dependency-audit-2026-09-13.md) for the full breakdown.

The local environment contains MongoDB, Resend, and Clerk settings. It does not contain the documented APP_URL, Stripe, or Inngest settings. Production environment variables may differ: their absence locally is not proof they are missing in Vercel. No secret values are included in this report.

This was a source audit plus local checks and limited public HTTP diagnostics. I did not execute live draws, send email, create subscriptions, alter database indexes, or change production data. There was no authenticated browser walkthrough, live database concurrency test, load test, backup restore, or provider-dashboard review. The deployed revision was not verified against the reviewed commit. Findings below are code-confirmed unless marked as a verification gate; their failure scenarios are reasoned from the code, not claims of incidents reproduced in production.

## P0: dependency remediation

### 1. Patch the authentication/framework dependency chain

Evidence: `package.json`, `pnpm-lock.yaml`, `proxy.ts:1`, and the registry audit.

- Installed `@clerk/nextjs` 6.37.3 and `@clerk/shared` 3.44.0 match a critical middleware route-protection bypass. The application uses the affected `createRouteMatcher` pattern. Clerk explicitly says downstream `auth()` checks continue to work, so the server-side checks here materially limit the impact; this is not evidence that sessions can be forged or all tenant data is exposed. Patch the SDK and its resolved shared package. The audit also reports a subsequent Clerk authorization advisory, so addressing only the first advisory is insufficient. [Clerk's advisory](https://github.com/clerk/javascript/security/advisories/GHSA-vqx2-fgx2-5wq9).
- Installed Next.js 16.2.6 matches multiple advisories, including denial of service in App Router Server Actions, a feature this app uses. Its advisory identifies 16.2.11 as a patched version, but later Next.js findings in the same scan require newer versions. Select a supported release resolving the complete applicable set, rather than stopping at one minimum patch. [Next.js Server Actions advisory](https://github.com/vercel/next.js/security/advisories/GHSA-m99w-x7hq-7vfj).
- The scan also reports critical Next.js Windows-hosted and AVIF image-optimization findings, and critical protobufjs findings under Inngest/OpenTelemetry. Windows-specific exposure does not apply to the documented Vercel deployment; an AVIF exploit path and attacker-controlled protobuf schema path were not demonstrated. Review reachability while updating the parent dependencies. [Next.js AVIF advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4).
- `react-email` is in runtime dependencies although its CLI is used for `email:dev`. Its tooling introduces many Socket.IO, glob, and configuration-parser findings. Move preview-only tooling to development dependencies where appropriate, keeping the runtime email components/rendering dependencies required by the app.

Acceptance: update and lock compatible parent packages, rerun the audit/build/tests, verify authentication flows against the patched SDK, and document any residual advisories with actual reachability analysis. Do not blindly override incompatible transitive major versions.

## P1: resolve before real-user registration and pickup

### 2. Public winners expose the credentials described as pickup proof

Evidence: `app/[orgSlug]/winners/page.tsx:68`, `emails/winner-ticket-email.tsx:123`, and `app/privacy/page.tsx`.

Anyone can see each winner's full name, sequential ticket number, ticket reference, and status. The email instructs the winner to bring the email, number, or reference to collect the ticket. Someone can copy those public values and present them at pickup. There is no implemented check-in workflow in this revision to provide a stronger enforcement boundary. This is an operational impersonation risk; it is not a demonstrated exploit against an existing redemption endpoint.

Use a private, unpredictable redemption credential, separate from any public display number. Publish minimal winner information only under an explicit disclosure policy, or replace public listing with private result lookup. Verify ownership and record one-time redemption at pickup; hiding the reference alone does not help if a public sequential number still serves as proof.

Acceptance: anonymous visitors cannot obtain enough information to redeem another person's allocation; duplicate redemption is rejected; the privacy notice and registration form accurately explain public disclosure.

### 3. A registration can succeed after the draw has selected its entrants

Evidence: `lib/actions/lottery.actions.ts:205` and `:300`; `lib/actions/lottery-draw.actions.ts:131`.

Registration commits its quota increment, then performs rate-limit work, then inserts the registrant. Those writes do not share a transaction. A possible sequence is:

1. Registration A claims a slot on the OPEN lottery.
2. The draw transaction marks the lottery drawn and selects the currently inserted registrants.
3. Registration A inserts its record and returns success.

That person is told they entered but was never eligible for the completed draw. The draw's transaction does not repair this gap because the earlier registration write has already committed.

Put the quota/status guard and registrant insertion in one transaction that conflicts with the draw's update to the same lottery document. Retain the unique indexes. Limit admission to an explicit OPEN state: the current `$ne: LOTTERY_DRAWN` check would also accept a `CLOSED` document if that state is used.

Acceptance: a real replica-set concurrency test proves every successful registration is included in the eligible draw snapshot, or the registration gets a closed response; simultaneous duplicate entries and draws preserve the invariants.

### 4. Registration failures can consume quota permanently for the day

Evidence: `lib/actions/lottery.actions.ts:258`, `:259`, and `:299`.

Errors reading headers or consuming either rate-limit counter occur after quota is claimed but before the insertion rollback handler. A rejected `Promise.all` goes to the outer generic error handler, leaving the slot consumed. A process termination between writes has the same effect. Even the insertion error path awaits quota rollback before rate-counter rollback, so a rollback error prevents the remaining cleanup.

Make admission transactional, keep abuse accounting deliberately separate where appropriate, and provide reconciliation for legacy counter drift. Decide how ambiguous write outcomes are resolved instead of relying solely on compensating decrements.

Acceptance: inject failures at every awaited boundary; failed admission does not silently reduce capacity, and counters reconcile with actual registrations.

### 5. Public-page disabling and subscription limits use stale cached authority

Evidence: `lib/org-cache.ts:23`, `:49`; `lib/actions/org.actions.ts:197`; `lib/orgs.ts:20`; `lib/actions/lottery.actions.ts:167`.

The five-minute process-local cache contains the whole organization, including `publicPageEnabled`, timezone, sender details, and daily quota. Settings invalidate it only when the slug changes. Disabling a public page therefore does not even invalidate the current instance, and other instances remain stale regardless. Billing updates also leave quota values cached. A paused public page can continue accepting entries and displaying winners for up to five minutes.

Read authoritative admission and visibility fields at the security-sensitive boundary, or provide shared invalidation/versioning with a clearly defined consistency guarantee. Settings changes should invalidate all relevant cached fields. A delayed branding change is tolerable; a disable switch should be dependable.

Acceptance: after disable returns success, subsequent requests across multiple instances cannot register or view the disabled page; quota upgrades/downgrades follow a documented effective-time rule.

### 6. Abuse controls do not adequately protect anonymous admission

Evidence: `lib/actions/lottery.actions.ts:22`, `:58`, `:152`, `:178`, `:258`.

The per-IP cap is 20 successful registrations/hour/org. This can block a community center or shared Wi-Fi network during a legitimate registration session. It also permits an attacker using different email addresses to occupy slots without proving ownership. There is no challenge or email verification. Duplicate attempts exit before rate limiting, and rejected attempts have rate counters refunded, so the limiter does not provide a general request-attempt budget. It runs after database lookups and quota writes.

The duplicate message is also an unauthenticated email-membership oracle for an org/day. Input validation uses a loose, unanchored email regex and no field-length bounds; large accepted fields are later copied into tickets, email payloads, and indexes. Forwarded IP headers are trusted without a documented hosting/proxy contract; header spoofing was not tested and should not be assumed possible on Vercel without verification.

Apply an early attempt-based budget, bound and strictly validate input, confirm trusted client-IP handling, and choose an anti-bot/ownership strategy suited to shared community networks. Minimize registration-status disclosure. For a supervised pilot, document a workable shared-network policy and support fallback.

Acceptance: invalid and duplicate floods are bounded before expensive work; valid shared-network users can participate; abuse cannot cheaply monopolize a day's quota or trigger unwanted winner email at scale.

### 7. Organization provisioning lacks an admin role check

Evidence: `lib/actions/org.actions.ts:59`.

`createOrganization` checks only that a user and active organization exist. Before the MongoDB organization document is provisioned, an ordinary member can supply the initial name, slug, and timezone. Updates later require an admin, but creation does not. Organization identity itself is correctly derived from Clerk, so this is an initial-configuration authorization gap, not arbitrary cross-tenant organization creation.

Require an org admin for user-supplied initial settings. If trusted auto-provisioning must work for members, derive its fields from Clerk in a separate controlled path.

Acceptance: a member cannot select another role's initial organization settings by invoking the server action directly.

## P1: winner email reliability

### 8. Interrupted dispatches remain stuck in `dispatching`

Evidence: `lib/email-dispatch-outbox.ts:5`, `:23`, `:35`; `inngest/functions/recover-winner-email-dispatches.ts:8`.

The outbox claims a row by marking it `dispatching`. Recovery only selects `pending` and `failed`. If the process stops after the claim, the row never becomes eligible again. A crash before sending loses automatic delivery; a crash after sending leaves tracking stale. The stale timestamp filter does not fix this because it is combined with the status filter that excludes `dispatching`.

Use an expiring lease with an ownership token, reclaim expired dispatches, and guard completion writes against old workers. Preserve the stable event identifier. Alert on exhausted attempts. Handle row-level failures so one failed dispatch does not abort the entire recovery batch; the current cron has zero retries and stops on the first thrown error. Recovery also needs an external health signal because an unconfigured Inngest integration cannot run its own recovery cron.

Acceptance: terminate a worker immediately after claiming; a replacement safely resumes the same dispatch without a redraw, duplicate tickets, or permanent abandonment.

### 9. Email sending is unbounded and is not idempotent at the provider

Evidence: `lib/email.ts:29`, `:60`; `inngest/functions/send-winner-emails.ts:23`, `:38`, `:83`; `lib/actions/lottery-draw.actions.ts:279`.

All winner emails start concurrently. The job has no paced batching, durable step checkpoints, or concurrency controls. Many simultaneous winners or organizations can exceed the shared Resend API limit; retries repeat the remaining burst. Resend documents a team-wide rate limit, so the actual account limit must inform pacing. [Resend API limits](https://resend.com/docs/api-reference/introduction).

`emailSent` is checked before sending and written afterward. A crash after provider acceptance but before the database write sends the same email again on retry. A manual retry can overlap the original worker: its uniqueness guard covers pending/dispatching outbox rows, not the entire email-delivery lifecycle. Concurrent failures can overwrite another worker's successful email status.

Use bounded durable batches, stable per-ticket provider idempotency keys, and monotonic delivery-state updates keyed by ticket identity. Provider idempotency has a retention window, so retain application-level recovery rules for longer delays. Resend documents a 24-hour key window. [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

The entire ticket array is copied into one MongoDB outbox document and one Inngest event. This also imposes a size ceiling despite the unlimited plan. Prefer a dispatch identifier and bounded ticket batches. Inngest documents payload limits and hosting-dependent execution timeouts; moving work into an Inngest function does not automatically remove Vercel invocation limits, despite the source comment. [Inngest limits](https://www.inngest.com/docs/usage-limits/inngest).

Acceptance: maximum supported draw size delivers within a stated deadline at the actual provider quota; simulated 429s, timeouts, database failures, and concurrent manual retries do not duplicate notifications or erase success. Track provider message IDs and delivery/bounce outcomes: `emailSent` currently establishes API acceptance, not inbox delivery. Provide an operator retry path for historical dates, since the current action only retries today's tickets.

## P1 before charging organizations

### 10. Upgrade/downgrade creates another subscription

Evidence: `app/(dashboard)/billing/page.tsx:166`; `app/api/billing/create-checkout/route.ts:60`; `lib/stripe.ts:46`.

The billing UI labels actions Upgrade/Downgrade, but every action opens a new subscription-mode Checkout session. The route does not check for an existing subscription, reuse an outstanding session, or supply an idempotency key. An already-paying customer can therefore create an additional subscription. Repeated checkout attempts and two admins acting concurrently make this more likely.

Customer creation also uses read-then-create without provider idempotency or a conditional persistence guard. Two first-time requests can create different customers, and the last database update wins, leaving events for the other customer unmatched.

Persist the canonical subscription identity. Modify the existing subscription through a deliberate upgrade/downgrade flow or a configured billing portal; reserve checkout for organizations without a relevant subscription. Make customer creation and checkout initiation retry-safe and concurrency-safe.

Acceptance: repeated clicks, concurrent admins, upgrades, downgrades, cancellation, and resubscription leave exactly the intended billable subscription and one canonical customer mapping.

### 11. Webhook ordering can permanently discard valid billing state

Evidence: `lib/orgs.ts:20`; `app/api/webhooks/stripe/route.ts:59`, `:68`, `:105`, `:132`.

Events use second-resolution `event.created`, while the update condition requires strictly newer timestamps. Two different valid events created within one second compete; the second is ignored and still recorded as processed. A valid event whose customer is not mapped also produces a zero-match update without an error, then is permanently acknowledged. The code does not distinguish stale events from missing organization mappings.

Subscription identity is not persisted or checked; events for an old/additional subscription can change the whole organization's entitlements. Unknown price IDs silently become the free plan. Invoice-failure handling preserves a plan obtained by a separate read, which adds another possible stale-state race.

Reconcile from the authoritative Stripe subscription, serialize updates per organization/customer as appropriate, retain a subscription ID, and distinguish obsolete, unknown, and successfully applied events. Quarantine or retry missing mappings and unknown prices instead of silently acknowledging them. Add a scheduled reconciliation path. Stripe explicitly does not guarantee event delivery order. [Stripe webhook guidance](https://docs.stripe.com/webhooks).

Acceptance: duplicate events, reversed ordering, same-second updates, delayed customer mapping, old-subscription deletion, and unknown prices converge to the current Stripe state without granting or withdrawing the wrong plan.

### 12. Degraded subscription behavior contradicts the product

Evidence: `lib/authz.ts:59`; `lib/actions/org.actions.ts:170`; `lib/actions/lottery.actions.ts:172`; `app/(dashboard)/billing/page.tsx:70`.

The billing page says canceled customers operate on free-tier limits, but draws and settings are blocked entirely. Public registration continues for canceled and past-due organizations because it does not check subscription status. A community can keep registering for a lottery that its administrator cannot draw. Past-due status can also prevent an admin disabling the public page through settings.

Define one entitlement policy for free, active, trialing, past-due, and canceled states, including the treatment of already-admitted entrants. Apply it consistently to admission, draws, settings, and UI messages. Allow essential shutdown/support actions during billing problems.

Acceptance: no state accepts entrants into a workflow that cannot complete under the published policy. The free downgrade path actually works if it is advertised.

## P2 and additional launch work

### 13. Expected closure/capacity states return generic errors

Evidence: `lib/actions/lottery.actions.ts:205`, `:229`, `:243`; `tests/public-registration.test.ts:93`.

With the intended unique org/day index present, a full or already-drawn lottery does not match the filtered upsert. MongoDB then attempts an insert that conflicts with that index. The action retries five times and returns a generic server error. The test for the friendly capacity message mocks a null result, which does not represent this normal indexed-upsert failure path. Separate creation from guarded increments, or classify duplicate failures by rereading the lottery. Also reject zero/invalid quota values explicitly; a new row or missing counter can pass the current missing-field branch even at a zero cap, while malformed limits become unlimited.

The form remains available after drawing and has no try/finally around the server-action call; a network rejection can leave it indefinitely loading. Show explicit open/full/drawn states, recover loading state on transport failure, and make errors accessible to assistive technology.

### 14. A failed initial MongoDB connection poisons the cached promise

Evidence: `lib/mongodb.ts:43`.

The first rejected connection promise remains cached. Subsequent requests in that process await the same rejection until the instance restarts. Clear a failed in-flight promise, bound connection/selection timeouts, and size pools for the deployment's instance count. Verify recovery by making the first connection fail and the next succeed without restarting the process.

### 15. Pagination bounds the response, but not the database work

Evidence: `lib/actions/participants.actions.ts:75`, `:83`, `:96`, `:167`; `lib/actions/lottery-query.actions.ts:42`; `lib/actions/platform.actions.ts:47`.

The participants query reads all matching organization history, computes a normalized email, sorts and groups it, and only then applies search/cursor/limit. The declared email/name indexes cannot satisfy a sort on the computed field or eliminate the post-group search work. The browser receives a bounded page, but database cost grows with total history on every request. Participant history and today's registrants are unbounded reads. The platform directory executes five queries per organization concurrently without pagination.

Maintain normalized participant identities and an indexed summary collection, or redesign the aggregation around persisted indexed fields and a documented history horizon. Paginate history, daily registrants, and the organization directory. Use query explain plans and realistic historical volumes. Until validated, use a measured operational cap rather than promising unlimited scale.

### 16. Operational integrity controls are incomplete or unverified

Evidence: `lib/setup-indexes.ts:243`, `lib/actions/lottery-query.actions.ts:32`, `lib/actions/lottery-query.actions.ts:86`, repository file inventory.

- The standalone required-index verifier omits several foundational invariants: registrant org/email/day uniqueness, lottery org/day uniqueness, organization slug/Clerk ID uniqueness, and global ticket-ID uniqueness. `setupIndexes` does create these, so this is not proof they are absent. Expand a read-only verification gate to cover all required invariants; do not substitute a mutating setup script for verification on every deploy.
- One winner lookup filters only by stored registrant IDs, omitting `orgId`. Normal draws populate those IDs from the same tenant, so a routine cross-tenant exploit was not established. Include `orgId` defensively to contain migration/data-corruption mistakes.
- Query helpers catch errors and return empty lists or OPEN/zero statistics. Database failure can look like a healthy empty lottery. Surface an unavailable state and correlate errors with alerts.
- There is no repository CI workflow or committed end-to-end suite. External branch protection and Vercel checks may exist but were not inspected. Unit tests mock MongoDB transactions and providers; they do not prove database isolation, unique-index behavior, or successful delivery.
- There is no application-level audit trail for who ran a draw or changed organization settings. Store actor, tenant, time, action, and relevant before/after values without unnecessarily duplicating personal data.

### 17. Public promises exceed the implemented operational workflow

Evidence: `lib/features.ts:27`, `components/pickup-management-preview.tsx`, `components/app-sidebar.tsx:38`, `README.md`, generated route inventory.

Marketing promises pickup confirmation, cancellation, and inventory monitoring. This revision includes a pickup preview, but no implemented check-in/cancel mutation or operational pickup route was found. Analytics links to `#`. The README mentions automatic draws and QR codes, while the only cron found retries email dispatches and the email template contains no QR code.

Ship the missing workflows if essential to launch, or accurately narrow the product promises. A manual draw is acceptable when scheduled and owned by an operator; it must not be presented as automated. Resolve same-day versus next-day language: the README describes tomorrow's tickets, while stored ticket dates and email dates use the draw day.

### 18. Privacy and data lifecycle need a concrete operating policy

Evidence: `app/privacy/page.tsx`, `app/terms/page.tsx`, `components/registration-form.tsx:100`, `lib/types.ts:37`, `lib/setup-indexes.ts`.

The registration checkbox only acknowledges that not everyone wins. There are no privacy/terms links on that form and no persisted consent timestamp or policy version. The privacy notice describes organizational access but not the public winner names/references; org members can also read participants, not only admins. Terms still state private beta and no paid plans.

Deletion requests have a contact email, but no documented execution process or retention schedule was found. Registrants, tickets, and email-dispatch payloads retain personal data, including duplicate copies across systems. Rate-limit records have TTL cleanup; the other collections do not. No Clerk organization-deletion synchronization was found, so removing an organization in Clerk does not itself prove the MongoDB public page is disabled.

Before collecting real user data, align the notice with actual behavior, link it at collection, define disclosure/consent records appropriate to the product, and document deletion/retention and organization shutdown across MongoDB, Clerk, Inngest, Resend, and operational logs. A supervised manual deletion process can serve a pilot if it is documented and tested. This is a technical/documentation gap assessment, not a determination of legal compliance or lottery licensing.

### 19. Verify and strengthen deployment controls

`next.config.ts` contains no application security-header policy. The public landing response includes HSTS but did not include CSP, frame protection, `X-Content-Type-Options`, or an explicit referrer policy. Evaluate appropriate headers, introduce CSP in report-only mode first, and test Clerk and other provider requirements before enforcement. One landing-page response does not establish all routes' header behavior.

Before launch, obtain evidence for the following gates. Their absence from this audit is not proof they are absent in the hosting dashboards:

| Gate | Evidence required |
| --- | --- |
| Deployed revision | Production deploy identifies the reviewed and subsequently remediated commit |
| Environment separation | Clerk, MongoDB, Inngest, Resend, and Stripe use the intended production accounts/keys; preview data is isolated |
| Database readiness | Resolvable production URI, transaction-capable topology, all unique/TTL indexes, least-privilege application credentials, appropriate network access |
| Disaster recovery | Enabled backups, defined recovery-point/recovery-time targets, and a successful restore into an isolated database |
| Email readiness | Verified sender/domain authentication, actual provider quota, synced Inngest functions, signing/event keys, monitored recovery schedule, successful controlled delivery |
| Incident response | Alert ownership for database failures, missed draws, stale dispatches, terminal email failures, and webhook failures; a tested operator runbook |
| Billing readiness | Live prices/keys/webhook signing, correct portal configuration, lifecycle tests, documented cancellation policy, and reconciliation |
| Deployment safety | Frozen lockfile install, enforced build/test/audit gates, known rollback deployment, and migration compatibility |
| Cost/abuse controls | Provider spending alerts, registration traffic thresholds, and an operator action that can actually pause abusive organizations |
| User-flow validation | Browser tests for signup/onboarding, roles, org switching, admission, draw, email, pickup, mobile layout, keyboard use, and error recovery |

## What is already sound

Organization identity generally comes from server-authenticated Clerk context, and admin mutations and billing routes check roles. Settings use strict Zod schemas and reserved-slug validation. Public winners omit email addresses. The draw uses cryptographic randomness and a transaction spanning draw state, tickets, and the email outbox. Useful unique indexes are defined. Stripe signatures are verified against the raw body, processed-event uniqueness exists, and billing redirect URLs come from configured APP_URL rather than a request Origin. Environment files are ignored and only `.env.example` is tracked. The build, type check, lint, and 100 tests all passed.

These are valuable foundations. The key remaining work is to make the boundaries between admission, draws, external delivery, and payment state reliable under failure and concurrency.

## Recommended execution order and release criteria

1. **Security patch and disclosure pass:** remediate runtime advisories; separate private pickup proof from public display; fix initial-org authorization; make public-page disable authoritative.
2. **Admission integrity pass:** transactionally register entrants; handle quota/closed states; bound inputs; revise abuse protection for shared networks; add real MongoDB concurrency and failure-injection checks.
3. **Delivery reliability pass:** expiring dispatch leases, bounded durable delivery, provider idempotency, monotonic state, historical retry tools, and failure alerts. Test interruptions after each external boundary.
4. **Pilot operations pass:** verify production services/indexes/backups; resolve pickup and date promises; publish accurate privacy/terms; perform a controlled end-to-end dress rehearsal with consenting test recipients.
5. **Paid launch pass:** canonical Stripe customer/subscription mapping, safe plan changes, robust webhook reconciliation, consistent cancellation/delinquency policy, and lifecycle tests. Keep price IDs unset until this passes, as the existing beta checklist intends.
6. **Scale pass:** index-backed summaries and pagination, bounded draw/event sizes, provider-budget-aware throughput, and a load test at the intended peak plus an agreed safety margin.

The free pilot gate is complete only when security patches, private redemption rules, atomic admission, recoverable email delivery, truthful feature claims, and verified operations are in place. The paid gate additionally requires billing correctness. A passing build alone is not the release criterion.

Only this report and its dependency appendix were added by the audit; application source and production state were not changed.
