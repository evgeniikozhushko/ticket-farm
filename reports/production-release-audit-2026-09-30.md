# Production Release Audit and Remediation Backlog

Audit date: September 30, 2026 (America/Edmonton).
Reviewed revision: `b9b9b49ed6d40203f07081cb64075f981598711f`.
Suggested implementation branch: `fix/production-release-hardening` (not created).

## Decision

**Not ready for production sign-off.** The application builds and its unit tests pass, but there are two reproduced email-delivery defects, a failing production dependency audit, and outstanding integration/operational release gates.

This is a standalone implementation backlog for a separate branch. It supplements, rather than replaces, the [Preview evidence](beta-preview-validation-2026-09-30.md) and [deployment checklist](../BETA_DEPLOY_CHECKLIST.md). Earlier Preview successes remain useful evidence; they do not cover the failures below or establish current Production configuration.

The initial release scope is the existing free private beta, with paid checkout disabled. Paid-billing work is explicitly separated below. No application fixes, dependency updates, provider changes, deployment, branch creation, or commit were performed during this audit.

## Scope and evidence

Reviewed server authorization and tenant filters, onboarding/settings, public registration and Turnstile, quota and draw transactions, ticket redemption, participant pagination, email dispatch/recovery/webhooks, billing routes, index setup, and operational documentation.

| Check performed | Current result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm exec tsc --noEmit --incremental false` | Passed |
| `pnpm build` | Passed, Next.js 16.3.5; local build using existing local configuration |
| `pnpm test` | 30 files / 217 tests passed; 5 files / 29 MongoDB tests skipped |
| Full suite with the disposable localhost replica-set URI | Five integration suites timed out connecting in setup; retry outside the sandbox had the same result. Integration assertions did not execute. Previously used temporary MongoDB binaries were absent. |
| `pnpm audit:production` | Failed: 1 critical, 3 high, 2 moderate, 1 low advisory |
| Temporary diagnostic tests against actual worker/webhook functions | Two reproductions passed, demonstrating R2 and R3 below with mocked external services and controlled scheduling |
| Documentation diff check | Passed |

Diagnostic tests asserted the observed defective behavior, not the desired behavior. They were removed after execution to leave a documentation-only handoff. Reproduction schedules and required regression tests are specified below.

No authenticated Production/Preview walkthrough, real provider delivery, load test, backup restore, or provider-dashboard inspection was performed in this audit. Production settings and backup availability are unverified, not asserted absent. This report includes no secret values, real participant addresses, private ticket References, or connection strings.

## Priority and release scope

| ID | Priority | Work | Release gate |
| --- | --- | --- | --- |
| R1 | High | Refresh vulnerable production dependencies | Free beta and paid release |
| R2 | High | Prevent an unresolved email recipient from blocking later batches | Free beta and paid release |
| R3 | Medium | Make projected email delivery status monotonic under concurrency | Free beta and paid release |
| R4 | High verification gate | Execute real MongoDB tests and make release verification reproducible | Free beta and paid release |
| R5 | High verification gate | Complete live provider, isolation, quota, and Production checks | Free beta and paid release |
| R6 | Operational gate | Demonstrate recovery, monitoring ownership, and rollback | Free beta and paid release |
| R7 | Operational gap | Define organization shutdown and data-request procedures | Before real participant onboarding |
| R8 | Medium | Make Stripe customer creation concurrency-safe | Before paid checkout; test-mode duplicates remain possible in beta |

Priorities describe application/release impact. Dependency advisory severities are listed separately; a vulnerable installed package is not by itself proof of an exploitable application endpoint.

## R1 — Production dependency audit fails

Evidence: `package.json`, `pnpm-lock.yaml`, and the current registry audit.

- `next@16.3.5`: critical `GHSA-vcvr-r3jv-pc5j`; patched in 16.3.6. The advisory requires attacker-controlled SVG data passed to the Node.js `next/og` ImageResponse implementation. No `next/og` or `ImageResponse` usage was found in the inspected application, so this audit does **not** establish reachable remote code execution. [Maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j).
- `brace-expansion@2.1.4`, through Inngest's OpenTelemetry dependency tree: two high denial-of-service advisories and one moderate advisory. The audit recommends 2.1.7 to address all three. No application-controlled glob input reaching this dependency was demonstrated. [Maintainer advisory for one high finding](https://github.com/juliangruber/brace-expansion/security/advisories/GHSA-6j4f-fj2g-mc7p).
- `@grpc/grpc-js@1.14.4`, also through Inngest/OpenTelemetry: a high certificate-authentication advisory and a low advisory; audit recommends 1.14.5. The high issue depends on particular gRPC server authentication settings; no such server use was found in application code. [Maintainer advisory](https://github.com/grpc/grpc-node/security/advisories/GHSA-m9gg-hp2v-232j).
- `uuid@10.0.0`, through Resend/Svix: moderate buffer-bounds advisory `GHSA-w5hq-g745-h8pq`. Review an upstream-compatible upgrade rather than forcing an untested major transitive version.

Work:

- [ ] Upgrade Next.js to a supported patched release, keeping `eslint-config-next` aligned.
- [ ] Refresh compatible Inngest/Resend dependency trees; use narrowly scoped overrides only if necessary and tested. Review all seven advisories for applicability and resolution.
- [ ] Commit the resulting lockfile on the implementation branch; use frozen-lockfile installs for verification.
- [ ] Pass the production high/critical audit gate, lint, types, full tests, build, and relevant Preview flows. Record any residual lower-severity advisory with rationale and owner.

Acceptance: no unresolved high/critical release-gate failures; no blanket audit suppression. Record exact resolved versions and dated audit output.

## R2 — One unresolved recipient blocks the rest of the draw's email batches

Evidence: `inngest/functions/send-winner-emails.ts:80–99`, `lib/result-email-delivery.ts:64–104`, and `inngest/functions/recover-winner-email-dispatches.ts`.

The worker throws inside `step.run` whenever a five-recipient batch reports a failed or uncertain recipient, before advancing its cursor. An uncertain row remains uncertain on every retry. Recovery starts the draw again from its first batch, so later recipients never get attempted if an earlier batch contains an unresolved row. A persistent failure becomes the same obstruction after attempts are exhausted. Manual retry also uses the same draw snapshot and worker.

Reproduced with the real worker handler: batch zero returned four skipped recipients, one uncertain recipient, `done: false`, and a next cursor. Two simulated independent invocations both threw after the first batch; neither invoked the next cursor. The batch service was mocked; no email was sent.

Work:

- [ ] Isolate terminal/uncertain recipients so they remain visible for reconciliation without preventing later eligible recipients from being processed.
- [ ] Preserve durable progress and retryable failures. Do not checkpoint a failure as a permanent success or lose transient retries when advancing pages.
- [ ] Keep the final job/operator signal unsuccessful when unresolved recipients remain, after unrelated eligible recipients have had an opportunity to run.
- [ ] Cover normal dispatch, recovery, and manual retry with at least 11 recipients: permanent failure or uncertainty in the first five, healthy recipients in subsequent pages, and a transient failure that later succeeds.

Acceptance: later healthy recipients send; accepted recipients are not resent; uncertain recipients are never blindly resent; unresolved outcomes still produce a visible failure/reconciliation signal.

## R3 — Concurrent events can regress the dashboard's delivery status

Evidence: `app/api/webhooks/resend/route.ts:65–109` and `lib/result-email-delivery.ts:16–58`.

Recipient records have ranked/ordered delivery updates, but the subsequent writes to `tickets` and `registrants` are unconditional with respect to delivery rank/time. A handler holding an older delivered snapshot can write after another handler has persisted a bounce. Both requests return 200, leaving the canonical recipient bounced while the ticket/participant display says delivered. Worker synchronization uses the same unguarded projection pattern.

Reproduced using the real webhook handler and mocked signature/database boundaries:

1. Delivery updates the canonical recipient and reaches its ticket update; pause that ticket write.
2. Bounce updates the canonical recipient and completes its ticket write; ticket reads bounced.
3. Resume the paused delivery write; ticket becomes delivered, and both handlers return 200.

Existing replay tests cover sequential delivery-after-bounce handling, which does not cover this overlapping schedule.

Work:

- [ ] Enforce the same ordering rule on every projected delivery-state write, or use one authoritative status read path. Apply the solution to winners, non-winners, webhooks, and worker synchronization.
- [ ] Retain replay-based repair when a downstream status write fails.
- [ ] Add controlled overlap tests and real-MongoDB assertions for delivery/bounce/failure ordering, including a worker racing a webhook.

Acceptance: once a higher-priority/newer outcome is stored, delayed writers cannot regress any user-visible record; canonical and displayed outcomes converge after retries.

## R4 — Integration verification is not currently reproducible from the default command

Evidence: all five `*.integration.test.ts` suites use `describe.skipIf(!TICKET_FARM_TEST_MONGODB_URI)`; no `.github` workflow directory was present. Current integration attempts timed out during connection setup, including outside the sandbox. This is an environment/verification failure, not evidence that the 29 assertions failed.

Work:

- [ ] Supply a documented disposable local/CI MongoDB replica set and readiness check; use only isolated test databases.
- [ ] Add a release-check command that fails clearly when the integration URI is missing or the replica set is unavailable. Preserve convenient unit-only development checks.
- [ ] Run all existing 246 tests with no integration skips, plus new regression tests from this report.
- [ ] Enforce or explicitly record lint, types, tests, production audit, and build for the release commit. Repository CI is a useful implementation; remote branch protection must be verified separately.

Acceptance: dated output for the exact release revision shows every required integration suite executed successfully. An ordinary `pnpm test` pass with skipped suites is insufficient.

## R5 — Live release checks remain incomplete

Evidence: the dated Preview report explicitly leaves several scenarios and Production setup outstanding. Source inspection found tenant-scoped ticket access and uncached organization lookups; this does not replace live checks.

- [ ] Record the immutable deployment URL/ID and source revision, plus environment scope, before testing.
- [ ] Disable public registration while a form is open; verify both fresh page requests and submissions are rejected without admission/counter changes. Re-enable and confirm admission succeeds.
- [ ] With 100 admitted entries on an undrawn test date, reject entry 101 at cap 100; raise to 250 and admit it immediately; restore 100 and reject further unique entries without removing existing registrations.
- [ ] Confirm organization B cannot look up or redeem organization A's Reference; verify direct member calls cannot draw, retry emails, change settings, or start billing flows.
- [ ] Exercise multiple filtered participant pages and selected-participant history pages.
- [ ] Verify signed delivered, bounced, and failed events against stored and displayed outcomes after R3; test delivery across multiple batches after R2.
- [ ] Confirm test-mode Stripe credentials before its signed webhook smoke. HTTP 200 proves endpoint acceptance only; paid billing remains disabled and requires its own lifecycle tests before launch.
- [ ] Independently verify Production DB/indexes, least-privilege access, Clerk, Turnstile, Inngest, Resend, application URL, and platform-admin allowlist. The last report recorded the Production Resend webhook secret as missing; recheck and complete it.
- [ ] Repeat environment-dependent smoke tests and inspect logs after Production deployment; remove temporary QA access with appropriate handling for protected Preview webhooks.

Acceptance: each required checklist item has a dated outcome for the correct environment; failures remain open. Do not infer Production isolation or provider wiring from Preview success.

## R6 — Recovery and operating limits need execution evidence

`DB.md` describes backups and a restore drill, and the deployment checklist describes Inngest monitoring. These are procedures, not evidence of configured backups, a successful restore, or staffed monitoring. Existing task history explicitly deferred an independent external heartbeat monitor.

- [ ] Confirm backup coverage/retention and agree recovery-point/recovery-time targets. Restore into an isolated destination and verify organizations, tickets, recipient snapshots, summaries, and required indexes without sending email.
- [ ] Name the operator and review cadence for failed Inngest runs, exhausted/uncertain recipients, webhook failures, registration failures, and provider usage. For an attended pilot, document the manual coverage window; broader unattended production needs an outage-detection path that does not rely solely on the failing worker itself.
- [ ] Record a known rollback revision/deployment and verify schema/index compatibility and how to pause admissions/sends during an incident. A code rollback does not undo database writes or email already sent.
- [ ] Validate the intended capacity: 100-recipient beta draws, the 250-entry manual quota, and simultaneous organizations. Measure admission errors, transaction latency, DB connections, and email backlog. Do not enable unlimited plans without an explicit supported bound or additional design: drawing currently loads all daily registrants and creates their recipient snapshots in one transaction.

Acceptance: retained restore results, an actionable incident/rollback runbook, monitoring ownership, and measured supported limits. Do not claim a fixed email deadline when older backlog or provider outages are present.

## R7 — Organization shutdown and data-request handling need a runbook

Evidence: the privacy page offers deletion requests; public lookup in `lib/orgs.ts` uses the MongoDB organization row. Clerk webhooks are intentionally absent for beta. Removing a Clerk organization therefore does not itself disable the MongoDB public registration page. No complete shutdown/deletion execution procedure was found in the reviewed documentation.

- [ ] Document and test an attended shutdown procedure: disable admissions in MongoDB, deal with pending draws/email jobs, verify public access is closed, then perform the intended identity-provider/data changes.
- [ ] Define authorized data-request verification, retention, and deletion/anonymization across registrations, tickets, summaries, dispatch snapshots, recipient records, provider history, logs, and backups. Ensure queued jobs cannot recreate or send deleted participant data.
- [ ] Align the privacy notice with the chosen procedure and redact unnecessary recipient addresses from routine error logs (`lib/email.ts` currently logs them on send failures).

Acceptance: demonstrate shutdown and a synthetic participant deletion request in an isolated environment; document the treatment of retained backups/provider data. A manual beta process is sufficient if complete and tested; this does not require adding Clerk webhooks or a new admin product surface. This is an operational data-handling assessment, not a legal-compliance opinion.

## R8 — Stripe customer creation can race (paid-release work)

Evidence: `lib/stripe.ts:37–55` reads an absent customer ID, creates a Stripe customer without an idempotency key, and unconditionally replaces the organization's customer ID. Concurrent calls can create two customers and retain only the last ID. A checkout created for the other customer can then emit subscription events that fail to match the stored organization customer. This is a source-confirmed failure path; it was not exercised against Stripe.

- [ ] Use stable provider idempotency and a concurrency-safe persistence strategy; every caller must resolve the same canonical customer.
- [ ] Test concurrent creation, provider-success/database-failure recovery, and webhook association with the canonical organization.
- [ ] Before enabling paid prices, separately test duplicate checkout requests, subscription update/cancellation, payment failures, and event replay/order. Keep beta price IDs unset until that work passes.

Acceptance: concurrent callers converge on one customer and subscription events update the intended organization. This does not block free-beta checkout hiding, but customer creation still runs during onboarding when a Stripe key is configured.

## Existing safeguards to preserve

- Server-side role guards derive organization identity from Clerk; inspected member data actions use organization filters, and settings reject unknown fields.
- Public admission uses Turnstile hostname/action checks, rate limits, and a transaction coupling the quota counter, registration, and participant summary.
- Admission and draw contend on the lottery document; draw persists tickets and recipient snapshots transactionally, with cryptographic selection and ticket IDs.
- Redemption is tenant-scoped and conditionally updates ticket state with summary counters in one transaction.
- Email delivery has an outbox, leases, provider idempotency, bounded batches, recovery, and historical retries. R2/R3 require focused corrections, not replacement of this architecture.
- Paid checkout resolves configured prices server-side and stays unavailable when price IDs are unset.

## Implementation order for the separate branch

- [ ] Start from a revision containing the reviewed baseline and preserve any newer fixes. Carry this report to the implementation branch; do not recreate already completed historical remediation.
- [ ] Resolve R1 and establish R4's working replica-set verification.
- [ ] Fix R2 with permanent regression coverage, then R3 including concurrent real-DB coverage.
- [ ] Complete R7's minimal operational procedures and R6's restore/incident/capacity evidence.
- [ ] Run all automated release gates, then R5's Preview scenarios on the exact candidate revision.
- [ ] Complete Production configuration review, deployment, and post-deployment verification under the release workflow.
- [ ] Close each item with commit/test/deployment evidence. Leave R8 explicitly deferred while paid checkout remains disabled, or complete it before a paid release.

Free-beta sign-off requires R1–R7 closed with evidence or an explicit, narrowly documented acceptance of a remaining operational limitation. There is no production approval implied by this report. Paid release additionally requires R8 and billing lifecycle validation.
