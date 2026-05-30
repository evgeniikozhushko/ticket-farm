# Production Beta Readiness — todo.md

## Summary

Prepare Ticket Farm for a Vercel-hosted private beta on ticketfarm.ca with open
organization signup, a fresh production MongoDB database, shared production sender
hello@ticketfarm.ca, Stripe kept in test mode, paid checkout hidden, and beta orgs
that need more than the free 100/day limit granted manually by a platform admin.

## Current blockers (verified)

- [x] `pnpm lint` fails on `scripts/ensure-next-dev-manifests.cjs` (3 `@typescript-eslint/no-require-imports` errors). — Resolved: added the file to `globalIgnores` in `eslint.config.mjs`.
- [x] `pnpm build` reportedly hangs locally at "Creating an optimized production build…". — Not reproduced after `pnpm clean && pnpm build`. Build now completes cleanly (compile ~2s, 13 static pages generated, exit 0). Suspected cause: stale `.next` cache. Re-verify on Vercel preview before promoting.
- [ ] `middleware.ts` uses the legacy convention. Next 16 warns to migrate to `proxy.ts`.

## Key changes

### 1. Fix release blockers
- [x] Lint: ignored `scripts/ensure-next-dev-manifests.cjs` in `eslint.config.mjs`. `pnpm lint` now exits 0.
- [x] Build hang: `pnpm clean && pnpm build` resolved it on first try. Build output shows Turbopack compile ~2s, TS check 2.5s, 13 static pages generated, exit 0. Still need to confirm green build on Vercel preview before promotion.
- [ ] Migrate `middleware.ts` → `proxy.ts` per Next 16. Preserve:
    - `clerkMiddleware` route protection for `/dashboard`, `/admin`, `/org`, `/billing`, `/onboarding`, `/checkin`, `/analytics`, `/platform`
    - org-required redirect to `/onboarding` when `orgId` is missing on org-required routes
    - existing matcher exclusions for static assets and `_next`

### 2. Configure production infrastructure
- [ ] Create a fresh MongoDB Atlas production database. Run `pnpm setup-db` once against prod env vars to create indexes.
- [ ] Configure Vercel production env vars:
    - MongoDB: `MONGODB_URI`, `MONGODB_DB_NAME`
    - Clerk: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, sign-in/up/after-* URLs
    - Resend: `RESEND_API_KEY`
    - Stripe (test mode): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
    - **Intentionally leave unset:** `STRIPE_STARTER_PRICE_ID`, `STRIPE_GROWTH_PRICE_ID`, `STRIPE_SCALE_PRICE_ID` (see §3)
    - Platform: `PLATFORM_ADMIN_USER_IDS`
    - Inngest production: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` — provider-side wiring only; app code does not currently read these and does not need to.
- [ ] Connect `ticketfarm.ca` to the Vercel project; add the domain to Clerk allowed redirect/origin URLs.
- [ ] Do NOT add Clerk webhooks or `CLERK_WEBHOOK_SECRET` for beta. Org creation stays owned by the in-app onboarding flow.

### 3. Beta billing behavior (decision: option C — env-driven, zero code change)
- [ ] In Vercel production, leave `STRIPE_*_PRICE_ID` unset. The existing `app/(dashboard)/billing/page.tsx:163` branch already falls through to "Price ID not configured", which hides the checkout button without any code change.
- [ ] Verify `BillingActionButton action="portal"` (line 121) remains gated by `org.stripeCustomerId` — fine to leave since no beta org will have a customer ID in test mode.
- [ ] Document the manual escalation path for beta orgs that need >100/day. `/platform/orgs` is view-only; bumps are made by editing the org document directly in MongoDB Atlas:
    - Find the org document by `clerkOrgId` in the `organizations` collection.
    - Set `planName` to one of `"free" | "starter" | "growth" | "scale"`.
    - Set `maxRegistrantsPerDay` to an integer, or `null` for unlimited.
    - Set `updatedAt` to the current `Date`.
    - Do not touch `subscriptionStatus` or `stripeCustomerId`; those remain Stripe-owned.

### 4. Public trust pages (concrete checklist, no design pass)
- [ ] Home (`app/page.tsx`): hero copy reflecting beta status, one primary CTA (sign up), footer linking to `/privacy` and `/terms`.
- [ ] About (`app/about`): sanity-check copy is beta-appropriate; no rewrite.
- [ ] Add `app/privacy/page.tsx`: registration data collected, email use, organization admin model, support contact.
- [ ] Add `app/terms/page.tsx`: beta terms, acceptable use, no liability for beta downtime, contact.
- [ ] Out of beta scope: analytics, check-in scanner, member-management UI. Do not touch.

## Test plan

### Automated gates (must pass before deploy)
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm build`

### Test updates
- [ ] Update `tests/middleware.test.ts` to import and exercise `proxy.ts` post-migration. The existing mocks for `clerkMiddleware` and `createRouteMatcher` should carry over.
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

_To be filled in after execution._
