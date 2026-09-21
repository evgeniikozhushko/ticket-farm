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
- [ ] Confirm sender email settings remain restricted to the verified
      `ticketfarm.ca` sender domain; custom org sender domains are out of scope
      for beta.
- [ ] Confirm lottery draw still uses crypto-grade randomness and aborts safely
      on duplicate `ticketId` collisions.

## 1. MongoDB Atlas

- [ ] Create a fresh production cluster (or DB inside an existing cluster).
- [ ] Note the connection string and DB name.
- [ ] Locally, with `MONGODB_URI` and `MONGODB_DB_NAME` pointed at production,
      run `pnpm setup-db` once to create indexes.
- [ ] Confirm `pnpm setup-db` prints "Required deploy indexes verified."
- [ ] In Atlas, confirm these required index groups exist:
      `registrants`, `tickets`, `lotteries`, `organizations`,
      `processed_webhook_events`, `email_dispatches`, `result_email_recipients`, and
      `public_registration_rate_limits`.
- [ ] Each warm Vercel instance uses a fixed MongoDB pool of at most 10 connections
      (`minPoolSize: 0`) with 5-second connect and server-selection timeouts. A
      transient initial connection failure can fail that request; the cached failed
      attempt is cleared so the next request connects again after Atlas recovers.

## 2. Vercel production env vars

Set these on the Vercel project for the `production` environment.

```
MONGODB_URI=<atlas prod connection string>
MONGODB_DB_NAME=<atlas prod db name>

APP_URL=https://ticketfarm.ca

RESEND_API_KEY=<resend prod key, sender hello@ticketfarm.ca>
RESEND_WEBHOOK_SECRET=<signing secret for Resend result-email webhook>

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

NEXT_PUBLIC_TURNSTILE_SITE_KEY=<production Turnstile site key>
TURNSTILE_SECRET_KEY=<matching production Turnstile secret key>
TURNSTILE_ALLOWED_HOSTNAMES=ticketfarm.ca
# Optional for supervised shared-network events: PUBLIC_REGISTRATION_IP_ATTEMPT_LIMIT=500
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
- [ ] Set paired Turnstile site and secret keys for preview. Include its exact hostname
      in `TURNSTILE_ALLOWED_HOSTNAMES` and the Cloudflare widget's hostname settings.
      Rebuild preview when changing `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- [ ] Run the manual smoke (§5) against the preview URL.
- [ ] Check Vercel function logs during smoke; there should be no unhandled
      errors from MongoDB, Clerk, Stripe, Resend, or Inngest.
- [ ] Promote the preview to production after the smoke passes.

## 5. Manual smoke test

Run against the Vercel preview URL.

- [ ] Sign up a new user; create an org via onboarding; land on lottery
      dashboard.
- [ ] Public registration at `<preview>/{orgSlug}` works with Turnstile; duplicate
      same-day entry shows ordinary success and consumes no additional lottery slot.
- [ ] With paired Cloudflare test sitekeys/secrets, check widget readiness and
      rejection behavior. The passing test secret returns a dummy hostname and no
      action, so the application's strict response checks reject it. Test credentials
      are documented at https://developers.cloudflare.com/turnstile/troubleshooting/testing/.
      Passing visible pair: sitekey `1x00000000000000000000AA`, secret
      `1x0000000000000000000000000000000AA`. Failing visible pair: sitekey
      `2x00000000000000000000AB`, secret `2x0000000000000000000000000000000AA`.
      Restore real preview keys, then verify successful registration and rejection
      on the configured exact preview hostname. Never mix a test sitekey with a
      production secret.
- [ ] Draw winners; Inngest enqueues `send-winner-emails`; Resend dispatches.
- [ ] In Resend, check the team's rate limit under Settings → Usage. Result emails
      reserve one shared send slot per second; confirm this is below the actual
      team rate before the first draw. The locally configured Resend key returned
      a 10 requests/second limit on 2026-09-20; confirm production uses that team.
      The Inngest route allows 60 seconds per step. The beta target is all 100 recipients from
      one draw accepted by Resend within 10 minutes of the worker starting when
      Resend and MongoDB are healthy and there is no older email backlog.
- [ ] Configure a Resend webhook at `https://ticketfarm.ca/api/webhooks/resend`
      for `email.delivered`, `email.bounced`, and `email.failed`; set its
      signing secret as `RESEND_WEBHOOK_SECRET`. Repeat with the preview URL and
      preview secret before promotion. Send Resend's delivered and bounced test
      addresses and confirm the ticket/registrant stores the provider message ID
      and delivery outcome. `emailSent` means API acceptance, not inbox delivery.
- [ ] In Inngest, confirm `recover-winner-email-dispatches` runs every 15 minutes
      and check its failed runs during the pilot. A failed run reports dispatch
      errors or rows that exhausted ten attempts. Inspect those rows in Atlas,
      resolve the delivery issue, then use the dashboard retry for the draw date.
      Recipients marked `uncertain` need provider reconciliation before any
      manual resend because Resend's idempotency key lasts only 24 hours.
- [ ] `/winners`, org settings, `/billing` (no checkout buttons visible, free
      tier shows "Available after beta." on paid cards), and `/platform`
      access (admin only) all render.
- [ ] `/dashboard/participants` renders and search/pagination work on the test
      org without loading every historical registrant into the browser.
- [ ] Stripe webhook endpoint returns 200 on a test-mode event.
- [ ] Atlas escalation dry-run: pick one beta test org, bump
      `maxRegistrantsPerDay` from 100 to 250 directly in Atlas, verify the next
      public registration observes the new limit, then reset the org. Already
      admitted registrations remain valid; lowering a cap below today's count
      stops further admission for that day.
- [ ] Public-page authority smoke: disable a beta test org's public page, then
      repeat page and admission requests across fresh requests/instances and
      confirm they are refused immediately. Re-enable it and confirm the next
      request succeeds.
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
