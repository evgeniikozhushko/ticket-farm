# Private Beta Deploy Checklist

A short, action-only checklist for promoting the `production-beta` branch to
`ticketfarm.ca`. The full plan lives in `tasks/todo.md`; this file is just the
dashboard/CLI steps and final launch gates that can't be automated from the code.

## 0. Code readiness gates

These should be true before promoting a public beta build.

- [ ] Font loading is production-safe: either self-host app fonts or confirm the
      production build environment can reliably fetch Google Fonts.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm exec tsc --noEmit`.
- [ ] Run `pnpm test`.
- [ ] Confirm the participant history page still uses database aggregation and
      pagination, not full org-wide in-memory scans.
- [ ] Confirm checkout remains server-side plan based: clients send `planName`,
      the server resolves Stripe price IDs, and redirects use `APP_URL`, not
      request `Origin`.
- [ ] Confirm org onboarding and org settings still derive organization identity
      from Clerk server auth and reject unknown/mass-assignment fields.
- [ ] Confirm lottery draw still uses crypto-grade randomness and retries
      duplicate `ticketId` collisions.

## 1. MongoDB Atlas

- [ ] Create a fresh production cluster (or DB inside an existing cluster).
- [ ] Note the connection string and DB name.
- [ ] Locally, with `MONGODB_URI` and `MONGODB_DB_NAME` pointed at production,
      run `pnpm setup-db` once to create indexes.
- [ ] Confirm `pnpm setup-db` prints "Required deploy indexes verified."
- [ ] In Atlas, confirm these required index groups exist:
      `registrants`, `tickets`, `lotteries`, `organizations`,
      `processed_webhook_events`, `email_dispatches`, and
      `public_registration_rate_limits`.

## 2. Vercel production env vars

Set these on the Vercel project for the `production` environment.

```
MONGODB_URI=<atlas prod connection string>
MONGODB_DB_NAME=<atlas prod db name>

APP_URL=https://ticketfarm.ca

RESEND_API_KEY=<resend prod key, sender hello@ticketfarm.ca>

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk prod publishable>
CLERK_SECRET_KEY=<clerk prod secret>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/lottery
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding
PLATFORM_ADMIN_USER_IDS=<comma-separated clerk user IDs for /platform/*>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

INNGEST_EVENT_KEY=<inngest prod event key>
INNGEST_SIGNING_KEY=<inngest prod signing key>
```

**Intentionally leave unset:**

```
STRIPE_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_SCALE_PRICE_ID
```

These keep paid checkout hidden on `/billing` during beta. The billing page
falls through to "Available after beta." automatically.

**Do not add** `CLERK_WEBHOOK_SECRET` — beta does not use Clerk webhooks; org
creation stays owned by the in-app onboarding flow.

## 3. Domain + Clerk

- [ ] In Vercel, point `ticketfarm.ca` (and the `www` subdomain if used) at the
      project.
- [ ] In the Clerk dashboard, add `https://ticketfarm.ca` (and `www` if used)
      to allowed redirect and origin URLs for the prod instance.

## 4. Deploy to Vercel preview first

- [ ] Push `production-beta` (already done if you're reading this on GitHub).
- [ ] Confirm Vercel builds the preview cleanly.
- [ ] Run the manual smoke (§5) against the preview URL.
- [ ] Check Vercel function logs during smoke; there should be no unhandled
      errors from MongoDB, Clerk, Stripe, Resend, or Inngest.
- [ ] Promote the preview to production after the smoke passes.

## 5. Manual smoke test

Run against the Vercel preview URL.

- [ ] Sign up a new user; create an org via onboarding; land on lottery
      dashboard.
- [ ] Public registration at `<preview>/{orgSlug}` works; duplicate same-day
      entry shows the duplicate message.
- [ ] Draw winners; Inngest enqueues `send-winner-emails`; Resend dispatches.
- [ ] `/winners`, org settings, `/billing` (no checkout buttons visible, free
      tier shows "Available after beta." on paid cards), and `/platform`
      access (admin only) all render.
- [ ] `/dashboard/participants` renders and search/pagination work on the test
      org without loading every historical registrant into the browser.
- [ ] Stripe webhook endpoint returns 200 on a test-mode event.
- [ ] Atlas escalation dry-run: pick one beta test org, bump
      `maxRegistrantsPerDay` from 100 to 250 directly in Atlas, wait up to 5
      min for the org-slug cache TTL, verify public registration accepts the
      101st entry that day, then reset the org.
- [ ] Production logs show no unhandled errors during smoke path.

## 6. Atlas escalation (operator note)

Beta orgs that need more than 100 registrants/day are bumped manually in
Atlas. `/platform/orgs` remains view-only during beta.

In the `organizations` collection, find the org by `clerkOrgId`, then set:

- `planName`: one of `"free" | "starter" | "growth" | "scale"`
- `maxRegistrantsPerDay`: integer, or `null` for unlimited
- `updatedAt`: current `Date`

Do NOT touch `subscriptionStatus` or `stripeCustomerId` — those remain
Stripe-owned and will be reconciled when paid checkout opens post-beta.

## 7. Promote

- [ ] Smoke passed on preview.
- [ ] Promote the tested Vercel deployment to production.
- [ ] Confirm `https://ticketfarm.ca` resolves and the marketing landing page
      loads.
