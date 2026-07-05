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
    - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up/after-* URLs
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

| Gate | Evidence |
| --- | --- |
| `pnpm lint` | Clean. |
| `pnpm exec tsc --noEmit` | No errors. |
| `pnpm test` | 15 files / 72 tests pass. |
| `pnpm build` | Compile 2.0s, TS 2.5s, 15 routes, `Proxy (Middleware)` confirmed. |
| Font loading prod-safe | `app/layout.tsx` uses `next/font/google` (Geist + Geist_Mono), build-time self-hosted. |
| Participant history uses DB aggregation + pagination | `lib/actions/participants.actions.ts:39` — `$match`/`$group`/`$lookup` pipeline, cursor by `email: { $gt: cursor }`, `$limit: limit + 1`. |
| Checkout server-side plan-based | `app/api/billing/create-checkout/route.ts` — client sends `planName`, server `getPriceIdForPlan`, redirects use `getAppUrl()` (not request `Origin`), admin gate + plan allowlist. |
| Org onboarding rejects mass-assignment | `lib/actions/org.actions.ts:50` — `createOrganizationSchema` accepts only `name`/`slug`/`timezone`; `orgSettingsSchema` (line 135) uses `.strict()`. `clerkOrgId`, `planName`, `subscriptionStatus`, `stripeCustomerId` are server-only. |
| Sender restricted to `ticketfarm.ca` | `lib/actions/org.actions.ts:37` — `isTicketFarmSender` refines `emailFromAddress` on update; default is `hello@ticketfarm.ca`. |
| Lottery draw uses crypto-grade randomness | `lib/actions/lottery-draw.actions.ts:3` — `randomInt` from `crypto`; Fisher-Yates shuffle; duplicate `ticketId` aborts via `DrawUserError`. |

Remaining work is all dashboard-driven and must be performed in Vercel/Atlas/Clerk/Stripe consoles:

1. Provision prod MongoDB; run `pnpm setup-db` against prod env.
2. Set Vercel prod env vars (block in `BETA_DEPLOY_CHECKLIST.md` §2).
3. Wire `ticketfarm.ca` in Vercel + Clerk allowed URLs.
4. Deploy to preview, run manual smoke (§5), promote.
