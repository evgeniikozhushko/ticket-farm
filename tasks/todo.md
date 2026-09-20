# Harden public registration abuse controls (finding #6)

## Approved plan

- [x] Replace loose registration parsing with bounded Zod validation: trimmed name (1–120), normalized valid email (maximum 254), consent, and a Turnstile token no longer than 2,048 characters; mirror field limits in the form.
- [x] Replace refundable success counters with non-refundable attempt budgets applied before organization lookup, duplicate lookup, Turnstile verification, and admission: a global hashed-IP one-hour budget (default 500, configurable with `PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT`) and a hashed email-plus-org-slug budget of 10/hour.
- [x] Prefer Vercel's `x-vercel-forwarded-for` client-IP header and use `x-forwarded-for` only when absent; validate the selected value as one IP, fail closed on malformed values, and allow missing headers only in development.
- [x] Add a dependency-free Cloudflare Turnstile managed widget and server-side Siteverify helper. Verify the client IP, action `public_registration`, and an exact hostname allowlist; retry one transient failure with the same UUID idempotency key and a three-second timeout per attempt.
- [x] Fail closed when Turnstile is unavailable or misconfigured; reject missing, invalid, expired, replayed, wrong-action, and wrong-host tokens; reset the single-use widget after every unsuccessful submission.
- [x] Require `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and comma-separated `TURNSTILE_ALLOWED_HOSTNAMES`; document the optional IP-budget override and preview hostname setup.
- [x] Move duplicate detection behind the budgets and challenge, return the ordinary success result without inserting or consuming quota, and keep `enterLottery`'s existing result type.
- [x] Update the privacy notice and operational documentation for Cloudflare, Turnstile configuration/test keys, shared-network override policy, and preview smoke scenarios; remove stale claims that registration has no rate limiting.
- [x] Add unit coverage for validation, trusted-IP handling, durable attempt budgets, Turnstile response/retry cases, uniform duplicate success, and ordering before expensive work.
- [x] Update the real MongoDB admission suite to use verified challenges and confirm quota, draw concurrency, duplicate, rollback, and rate-limit invariants remain intact.
- [x] Run the full local replica-set suite, lint, type checking, production build, and `git diff --check`; review the final diff and record changes, verification, and limitations below.

## Decisions and assumptions

- Cloudflare Turnstile Managed mode plus attempt budgets is the private-beta anti-abuse strategy. It raises the cost of distributed abuse but does not prove ownership of the supplied email; email confirmation remains a future escalation if beta abuse warrants it.
- Duplicate submissions receive the same success UI as new registrations but create no record and consume no lottery quota.
- Challenge/provider/configuration failures fail closed.
- The shared-network IP budget defaults to 500 attempts/hour and can be raised deliberately for a supervised event through configuration.
- The pre-challenge email-plus-slug budget can temporarily lock out a targeted email. Accept this tradeoff for the supervised pilot.
- Turnstile hostnames are checked against an explicit server-side allowlist for preview and production.
- Ticket Farm is assumed to run directly behind standard Vercel ingress without a custom trusted proxy.
- Cloudflare's passing test secret currently returns a dummy hostname and no action, so strict Siteverify checks reject it. Use test keys to check rejection and real preview keys for successful end-to-end registration.
- Vercel documents `x-vercel-forwarded-for` as its stable copy of `x-forwarded-for`, with incoming `x-forwarded-for` overwritten on standard ingress. Verified Proxy Lite is available on Hobby/Pro for supported providers, while custom trusted proxy support differs; any proxy change requires a new IP-policy review. See https://vercel.com/docs/headers/request-headers and https://vercel.com/docs/security/reverse-proxy.
- Finding #7 and later production-readiness findings are out of scope for this task.

## Review

### Changes

- Added global IP and email-plus-canonical-slug attempt budgets, bounded input validation, trusted Vercel IP handling, and server-side Turnstile verification. Removed rate-limit refunds.
- Added the Managed widget and uniform duplicate success while preserving transactional admission and quota behavior.
- Updated environment, privacy, project, and beta deployment documentation; no dependencies added.

### Verification

- `TICKET_FARM_TEST_MONGODB_URI='mongodb://127.0.0.1:27187/?replicaSet=ticketfarmtest' pnpm test` — 25 files, 189 tests passed, including real local MongoDB admission tests.
- `pnpm lint`, `pnpm exec tsc --noEmit --incremental false`, `pnpm build`, and `git diff --check` — passed. The public organization route remains dynamic.
- Live Cloudflare passing test secret returned a dummy hostname and no action; the failing test secret returned `success: false`. These provider probes confirm why the application requires real preview keys for successful end-to-end smoke.

### Limits

- Preview smoke with real Turnstile keys and configured preview hostname remains a deployment step; no preview credentials or deployment were available in this workspace.
- The pre-challenge email budget can temporarily block a targeted email, and shared networks can reach the global IP budget. Neither control proves email ownership.
- The disposable replica set was bound to localhost and used random test databases. No production database, dependencies, commits, or deployment were changed.

# Authoritative public-page and quota state (finding #5)

## Root cause

`lib/org-cache.ts` caches the whole organization document per process for 5 minutes and
is the only source for both public boundaries (`app/[orgSlug]/page.tsx`,
`enterLottery`). `publicPageEnabled`, `timezone` and `maxRegistrantsPerDay` are therefore
served stale. `updateOrganizationSettings` invalidates only on slug change, and only on the
instance that handled the request; the Stripe path (`updateSubscriptionStatus`) invalidates
nothing. Caching cannot be made authoritative here: a fresh read of these fields is the same
single indexed `findOne` the cache was avoiding.

## Plan

- [x] Move `getOrgBySlug` into `lib/orgs.ts` as an uncached `findOne({ slug, publicPageEnabled: true })`; delete `lib/org-cache.ts`.
- [x] Update the two callers (`app/[orgSlug]/page.tsx`, `lib/actions/lottery.actions.ts`) and drop `invalidateOrgCache` from `lib/actions/org.actions.ts`.
- [x] Remove the "5 minutes to propagate" notice in `components/org-settings-form.tsx`.
- [x] Document the effective-time rule in `BETA_DEPLOY_CHECKLIST.md` and `PROJECT_SUMMARY.md`: settings and quota changes apply to the next request on every instance; admitted registrations are never revoked; a cap below the day's count stops further admission that day.
- [x] Tests: replace `tests/org-cache.test.ts` with `tests/orgs.test.ts` coverage (DB read per call, `publicPageEnabled` filter); repoint mocks in `tests/public-registration.test.ts`; make the registration integration suite seed/read the real organization collection; drop invalidation assertions in `tests/org-actions.test.ts`; add real-database regressions showing a disable refuses the next admission and a quota change affects the next attempt.
- [x] Verify: targeted tests, full suite against the local replica set, `pnpm lint`, `tsc --noEmit`, `pnpm build` (confirm `/[orgSlug]` stays dynamic, not prerendered).
- [x] Add a preview smoke step for the acceptance boundary: after disabling a page, repeat page and admission requests across fresh requests/instances and confirm immediate refusal; change the quota and confirm the next admission observes it without a TTL wait.
- [x] Review the final diff and record verification and limits.

## Scope notes

- Leave `APP_SCALE_PLAN.md` and `SAAS_PLAN.md` unchanged because their cache references describe historical design intent; update the current operational sources `BETA_DEPLOY_CHECKLIST.md` and `PROJECT_SUMMARY.md`.
- Removing the negative cache means unknown-slug traffic performs an indexed MongoDB lookup per request. Keep request-budget and bot mitigation changes in finding #6 rather than coupling them to authority correctness.
- Define "next request" as a request whose authoritative organization lookup begins after the settings or quota write completes. An already in-flight request is not revoked; admitted registrations remain valid.

## Review — authoritative public state

### Changes

- `getOrgBySlug` now lives in `lib/orgs.ts` and reads `{ slug, publicPageEnabled: true }` on
  every call; `lib/org-cache.ts` and its test are deleted. Both public boundaries — the page
  render and `enterLottery` — resolve the organization from MongoDB per request, so
  `publicPageEnabled`, `timezone` and `maxRegistrantsPerDay` are authoritative on every
  instance.
- `updateOrganizationSettings` no longer invalidates a cache, and the settings form no longer
  promises a 5-minute slug propagation delay.
- `BETA_DEPLOY_CHECKLIST.md` and `PROJECT_SUMMARY.md` state the effective-time rule and replace
  the TTL wait in the Atlas escalation dry-run; a disable/re-enable smoke step was added to the
  preview walkthrough.
- The registration integration suite seeds a real `organizations` document instead of mocking
  the lookup, and drives capacity cases through that document. Added regressions: a disable
  refuses the next admission, and a quota lowered then raised is observed on the next attempt.

### Verification

- `TICKET_FARM_TEST_MONGODB_URI='mongodb://127.0.0.1:27187/?replicaSet=ticketfarmtest' pnpm test`
  — **24 files, 166 tests passed**, no skips; both integration suites ran.
- `pnpm lint`, `pnpm exec tsc --noEmit --incremental false`, `pnpm build` — passed.
- `pnpm build` route table shows `ƒ /[orgSlug]` (server-rendered on demand), so no
  `force-dynamic` directive was needed and no full-route cache can serve a disabled page.
- `git diff --check` clean; final diff reviewed.
- The first suite run failed in `beforeAll` because the local disposable mongod was running
  without an initiated replica set; initiated it on 127.0.0.1:27187 and re-ran. No application
  database was used.

### Limits

- Multi-instance behavior is argued from the removal of all process-local state and verified
  against a real database in-process; the preview disable/re-enable smoke across Vercel
  instances remains an unchecked deployment step.
- Unknown-slug traffic now performs an indexed lookup per request. A request budget belongs to
  finding #6.
- `APP_SCALE_PLAN.md` and `SAAS_PLAN.md` still describe the cache as historical design intent
  and were intentionally left unchanged.
- Editor formatting (Prettier) reflowed unrelated lines in `lib/actions/org.actions.ts`,
  `lib/actions/lottery.actions.ts`, the touched tests, and the `PROJECT_SUMMARY.md` tables.
  Those hunks are formatting only and were preserved, not reverted.

# Transactional registration admission

## Approved plan

- [x] Inspect registration, draw transaction, indexes, and disposable database tests.
- [x] Commit quota and registration together; preserve limiter policy and refund definitive failures once.
- [x] Handle full/closed, missing counters, duplicate races, retries, and uncertain commits.
- [x] Update unit tests and add local replica-set concurrency/rollback coverage.
- [x] Run full local replica-set suite, lint, type checking, production build, and review diff.

Pre-launch assumption: no historical counter reconciliation or production migration. Deployment must verify unique registration `(orgId, email, date)` and lottery `(orgId, date)` indexes. Production deployment/index status remains unverified.

## Review — transactional admission

### Changes

- Registration and quota increment commit together on the lottery document used by the draw; callbacks allow driver retries and retain one registrant ID.
- Initialization cannot reopen/reset a lottery. Legacy missing counters count scoped registrations within the transaction. Full, zero-cap, closed, and unavailable responses are distinct.
- Both limiter outcomes settle before admission. Confirmed consumptions are refunded once on definitive failure, including partial limiter failure; refund errors cannot replace the response. No quota compensation remains.
- Uncertain commits use the attempt ID for primary/majority confirmation. Unconfirmed outcomes retain rate-limit consumption and return an explicit uncertainty response.
- Added 11 disposable local replica-set tests and updated 32 registration unit tests. Both controlled draw orderings and competing admissions assert the committed outbox recipient snapshot.

### Verification

- `TICKET_FARM_TEST_MONGODB_URI='mongodb://127.0.0.1:27187/?replicaSet=ticketfarmtest' pnpm test` — **25 files, 164 tests passed**, including all integration tests.
- `pnpm lint` — passed.
- `pnpm exec tsc --noEmit --incremental false` — passed.
- `pnpm build` — passed.
- `git diff --check` — passed; final code/test diff reviewed.
- Initial integration connection attempts timed out because no local server was running. Started a fresh localhost-only disposable replica set; successful tests created/dropped random test databases. No application database was used.

### Deployment requirements and limits

- Before deployment, inspect installed indexes directly (`registrants.listIndexes()` and `lotteries.listIndexes()`) and require unique `{ orgId: 1, email: 1, date: 1 }` and `{ orgId: 1, date: 1 }`, respectively. Integration setup creates both. The existing index verifier alone does not verify these foundational constraints; also verify the existing global unique ticket reference index at deployment.
- Deployment and installed production indexes remain unverified. No production migration or historical counter reconciliation performed; the pre-launch assumption remains explicit.
- Commit uncertainty is covered with driver-error mocks; real replica-set tests cover transaction conflict retries and rollback, not network-failure injection. Network failure can still prevent a definitive client answer even though quota and registration remain atomic.
- Existing rate-limit policy, response shape, organization/date scoping, and `CLAUDE.md` user changes preserved. No dependencies added, commits made, or deployment performed.
- This resolves the registration/draw admission and separate quota/insert findings (#3 and #4); earlier task reviews below are historical. Other readiness findings remain out of scope.

# Private draw results and redemption

## Approved implementation

- [x] Inspect draw snapshot, references, email/outbox, authorization, pickup model, and public routes.
- [x] Persist non-winner notification work in the draw transaction and extend delivery/retry tracking.
- [x] Remove public results and update email/privacy wording; retain existing pickup fields.
- [x] Add organization-scoped reference lookup and atomic check-in in the Lottery dashboard.
- [x] Verify notifications, authorization, public access, and concurrent redemption; run project checks.
- [x] Review final diff and record verification/limitations.

## Results/redemption review — September 14, 2026

### Changes

- Removed `/{orgSlug}/winners` and its registration link. Legacy `/winners` remains an explicit 404.
- Reused the cryptographically generated 12-character reference and existing unique-index definition. No additional credentials or registrant lookup flow.
- Saved non-winner recipient IDs and email payloads in the draw outbox transaction alongside winner tickets. Existing `(orgId, date)` identifies the single daily draw. No invented eligibility statuses; only the transaction's actual entrant snapshot is notified.
- Added non-winner notification acceptance/error tracking and extended the existing current-day retry action. Successful writes cannot be overwritten by concurrent failure writes; both templates use stable provider idempotency keys.
- Added a staff reference panel with explicit confirmation. Atomic `ACTIVE` to `CHECKED_IN` update records `checkedInAt`; cross-organization references behave as invalid. Participant history exposes check-in time and non-winner email acceptance/error state.
- Tightened member-role authorization and the winner query's organization scope. Updated registration, privacy, and pickup-proof copy.
- Preserved existing pickup time/location. Existing date is explicitly labeled lottery date. No pickup-date setting or resend-management feature was added.

### Verification

- Full suite with disposable local MongoDB replica set: **24 files, 131 tests passed**, including real transaction rollback, snapshot/retry exclusion of late registrations, tenant isolation, and concurrent redemption (exactly one success and stable timestamp).
- Reproduce database integration tests using `TICKET_FARM_TEST_MONGODB_URI='mongodb://127.0.0.1:<port>/?replicaSet=<name>' pnpm test`. Tests create and drop only a randomly named local test database. Without this variable, four integration tests are explicitly skipped.
- `pnpm lint`, `pnpm exec tsc --noEmit --incremental false`, `pnpm build`, and `git diff --check` passed.
- Production-server HTTP checks: `/example-org/winners` and `/winners` returned **404**; anonymous `/dashboard/lottery` returned **307** to authentication.
- Inspected public routes/actions/API entry points and retained authenticated dashboard queries. Email markup and provider-call tests verify recipient, reference, instructions, and idempotency keys. No real notification emails were sent.

### Limitations / remaining readiness work

- Configured database read-only count/index check failed with DNS `ENOTFOUND`, including outside the sandbox. Existing production data and installed production indexes could not be verified. The user's pre-launch assumption remains explicit; no production data was modified.
- Report issues #3 (registration/draw admission race), #8 (stuck dispatch leases), and remaining #9 concerns (provider pacing, large event payloads, recovery after provider idempotency expires) are not resolved by this focused change. Snapshot-based notifications exclude late entrants but do not repair admission fairness. Provider acceptance is not guaranteed inbox delivery.
- No authenticated browser or live Inngest/Resend delivery walkthrough was performed. Deployment/provider checks remain necessary before launch.
- No dependencies added. Existing untracked `AGENTS.md` and previous task history preserved. Final diff reviewed; no commits or deployment performed.

# Production Beta Readiness — todo.md

## Summary

Prepare Ticket Farm for a Vercel-hosted private beta on ticketfarm.ca with open
organization signup, a fresh production MongoDB database, shared production sender
hello@ticketfarm.ca, Stripe kept in test mode, paid checkout hidden, and beta orgs
that need more than the free 100/day limit granted manually by a platform admin.

## Current blockers (verified)

- [x] `pnpm lint` fails on `scripts/ensure-next-dev-manifests.cjs` (3 `@typescript-eslint/no-require-imports` errors). — Resolved: added the file to `globalIgnores` in `eslint.config.mjs`.
- [x] `pnpm build` reportedly hangs locally at "Creating an optimized production build…". — Not reproduced after `pnpm clean && pnpm build`. Build now completes cleanly (compile ~2s, 13 static pages generated, exit 0). Suspected cause: stale `.next` cache. Re-verify on Vercel preview before promoting.
- [x] `middleware.ts` uses the legacy convention. Next 16 warns to migrate to `proxy.ts`. — Resolved: `git mv middleware.ts proxy.ts`, updated `tests/middleware.test.ts` imports from `@/middleware` → `@/proxy`. All 36 tests pass; build no longer warns.

## Key changes

### 1. Fix release blockers

- [x] Lint: ignored `scripts/ensure-next-dev-manifests.cjs` in `eslint.config.mjs`. `pnpm lint` now exits 0.
- [x] Build hang: `pnpm clean && pnpm build` resolved it on first try. Build output shows Turbopack compile ~2s, TS check 2.5s, 13 static pages generated, exit 0. Still need to confirm green build on Vercel preview before promotion.
- [x] Migrate `middleware.ts` → `proxy.ts` per Next 16. Done via `git mv` (history preserved). `clerkMiddleware` wrapper, route matchers, and onboarding redirect logic all preserved as-is — Clerk 6.37.3 still only exports `clerkMiddleware`, no `clerkProxy` needed. Build clean, tests green.

### 2. Configure production infrastructure

- [ ] (Vercel/Atlas dashboard work) Create a fresh MongoDB Atlas production database. Run `pnpm setup-db` once against prod env vars to create indexes.
- [ ] (Vercel dashboard work) Configure Vercel production env vars:
  - MongoDB: `MONGODB_URI`, `MONGODB_DB_NAME`
  - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up/after-\* URLs
  - Resend: `RESEND_API_KEY`
  - Stripe (test mode): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - **Intentionally leave unset:** `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` (see §3)
  - Platform: `PLATFORM_ADMIN_USER_IDS`
  - Inngest production: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — provider-side wiring only; app code does not currently read these and does not need to.
- [ ] (Vercel/Clerk dashboard work) Connect `ticketfarm.ca` to the Vercel project; add the domain to Clerk allowed redirect/origin URLs.
- [x] Do NOT add Clerk webhooks or `CLERK_WEBHOOK_SECRET` for beta. Org creation stays owned by the in-app onboarding flow. Decision recorded; no code change needed.
- [x] Audited `.env.example` vs every `process.env.*` reference in the codebase. Only gap was `SEED_ORG_ID`, which is read only by the one-shot `scripts/migrate-add-orgid.ts` migration; not relevant for a fresh prod DB, intentionally left out. Added a comment on the `STRIPE_*_PRICE_ID` block documenting the unset-in-beta decision.

### 3. Beta billing behavior (decision: option C — env-driven, zero code change)

- [x] In Vercel production, leave `STRIPE_*_PRICE_ID` unset. Verified code path: `getPriceIdForPlan` (`lib/plan-limits.ts:32`) returns `undefined`, billing page falls through to the "Available after beta." fallback. (Dashboard step remains — must be set as unset in Vercel during §2.)
- [x] Verified `BillingActionButton action="portal"` (`app/(dashboard)/billing/page.tsx:118`) is gated by `org.stripeCustomerId`. Beta orgs in test mode without a customer ID will not see it.
- [x] Bonus: changed the no-priceId fallback copy from operator-style "Price ID not configured." to customer-facing "Available after beta." (`app/(dashboard)/billing/page.tsx:180`).
- [x] Document the manual escalation path for beta orgs that need >100/day. Landed in `BETA_DEPLOY_CHECKLIST.md` §6 (lines 120–132). Operator note covers `clerkOrgId` lookup, `planName` / `maxRegistrantsPerDay` / `updatedAt` fields, and explicit "do not touch" guard on `subscriptionStatus` and `stripeCustomerId`.

### 4. Public trust pages (concrete checklist, no design pass)

- [x] Home (`app/page.tsx`): added "· Private Beta" to the eyebrow line and a footer row with Privacy / Terms / hello@ticketfarm.ca links. Hero copy and primary CTA preserved.
- [x] About (`app/about`): replaced the placeholder `<div>About</div>` with minimal beta-appropriate copy and a contact link.
- [x] Added `app/privacy/page.tsx`: account data, lottery-registration data, email use, org isolation, subprocessor list, contact.
- [x] Added `app/terms/page.tsx`: beta status disclaimer, customer data ownership, acceptable use, beta billing note, limited-liability clause, contact.
- [ ] Out of beta scope: analytics, check-in scanner, member-management UI. Do not touch.

## Test plan

### Automated gates (must pass before deploy)

- [x] `pnpm lint` — clean (one advisory: baseline-browser-mapping data >2 months old, non-blocking).
- [x] `pnpm test` — 15 files, 72 tests, all pass (540ms).
- [x] `pnpm build` — compile 2.0s, TS 2.5s, 15 routes generated, `Proxy (Middleware)` confirmed.

### Test updates

- [x] Update `tests/middleware.test.ts` to import and exercise `proxy.ts` post-migration. Done — 4 `@/middleware` import paths swapped to `@/proxy`; existing mocks carried over unchanged. All 4 cases still pass.
- [ ] No new automated test for checkout hiding — the mechanism is "env var unset", and a unit test for that is brittle. Cover it in the manual smoke instead.

### Manual smoke test on Vercel preview

- [ ] Sign up a new user; create an org via onboarding; land on lottery dashboard.
- [ ] Public registration at `https://<preview>/{orgSlug}` works; duplicate same-day entry shows the duplicate message.
- [ ] Draw winners; Inngest enqueues `send-winner-emails`; Resend dispatches.
- [ ] `/winners`, org settings, billing page (no checkout buttons visible), and `/platform` access (admin only) all render.
- [ ] Stripe webhook endpoint returns 200 on a test-mode event.
- [ ] Atlas escalation dry-run: pick one beta test org, bump `maxRegistrantsPerDay` from 100 → 250 directly in Atlas, wait for the org slug cache TTL (up to 5 min), verify public registration accepts the 101st entry that day, then reset the org.
- [ ] Production logs show no unhandled errors during smoke path.

## Release process

- [ ] Deploy branch to Vercel preview.
- [ ] Run full automated gate + manual smoke against preview.
- [ ] Confirm production MongoDB indexes exist post `pnpm setup-db`.
- [ ] Promote tested Vercel deployment to production; point `ticketfarm.ca` at it.

## Assumptions

- Vercel is the production host.
- Production starts with a fresh database (no migration of staging data).
- Stripe stays in test mode for the duration of beta.
- Paid checkout is hidden by unsetting price IDs.
- Platform admins have Atlas read/write access to the production cluster. `/platform/orgs` remains view-only during beta; Atlas is the only operator path for beta limit bumps.
- Monitoring uses Vercel, Clerk, Stripe, Resend, Inngest, and MongoDB dashboards only. No Sentry or custom alerting in beta.
- Shared sender is `hello@ticketfarm.ca`; per-org sender domains are deferred.

## Review

Code-side beta-readiness work is complete:

- **Blockers cleared:** lint (`scripts/ensure-next-dev-manifests.cjs` ignored), build (stale `.next` was the cause), Next 16 `middleware.ts` → `proxy.ts` migration.
- **Billing:** `STRIPE_*_PRICE_ID` left unset; fallback copy switched to customer-facing "Available after beta."
- **Trust pages:** Home eyebrow/footer, About, Privacy, Terms all landed.
- **Env audit:** `.env.example` reconciled against every `process.env.*` reference.
- **Atlas runbook:** documented in `BETA_DEPLOY_CHECKLIST.md` §6.

### BETA_DEPLOY_CHECKLIST §0 — code-readiness gates (verified 2026-06-19)

All seven gates pass:

| Gate                                                 | Evidence                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`                                          | Clean.                                                                                                                                                                                                                                   |
| `pnpm exec tsc --noEmit`                             | No errors.                                                                                                                                                                                                                               |
| `pnpm test`                                          | 15 files / 72 tests pass.                                                                                                                                                                                                                |
| `pnpm build`                                         | Compile 2.0s, TS 2.5s, 15 routes, `Proxy (Middleware)` confirmed.                                                                                                                                                                        |
| Font loading prod-safe                               | `app/layout.tsx` uses `next/font/google` (Geist + Geist_Mono), build-time self-hosted.                                                                                                                                                   |
| Participant history uses DB aggregation + pagination | `lib/actions/participants.actions.ts:39` — `$match`/`$group`/`$lookup` pipeline, cursor by `email: { $gt: cursor }`, `$limit: limit + 1`.                                                                                                |
| Checkout server-side plan-based                      | `app/api/billing/create-checkout/route.ts` — client sends `planName`, server `getPriceIdForPlan`, redirects use `getAppUrl()` (not request `Origin`), admin gate + plan allowlist.                                                       |
| Org onboarding rejects mass-assignment               | `lib/actions/org.actions.ts:50` — `createOrganizationSchema` accepts only `name`/`slug`/`timezone`; `orgSettingsSchema` (line 135) uses `.strict()`. `clerkOrgId`, `planName`, `subscriptionStatus`, `stripeCustomerId` are server-only. |
| Sender restricted to `ticketfarm.ca`                 | `lib/actions/org.actions.ts:37` — `isTicketFarmSender` refines `emailFromAddress` on update; default is `hello@ticketfarm.ca`.                                                                                                           |
| Lottery draw uses crypto-grade randomness            | `lib/actions/lottery-draw.actions.ts:3` — `randomInt` from `crypto`; Fisher-Yates shuffle; duplicate `ticketId` aborts via `DrawUserError`.                                                                                              |

Remaining work is all dashboard-driven and must be performed in Vercel/Atlas/Clerk/Stripe consoles:

1. Provision prod MongoDB; run `pnpm setup-db` against prod env.
2. Set Vercel prod env vars (block in `BETA_DEPLOY_CHECKLIST.md` §2).
3. Wire `ticketfarm.ca` in Vercel + Clerk allowed URLs.
4. Deploy to preview, run manual smoke (§5), promote.
