Architecture (current)

  - Next.js App Router app with server-rendered pages plus client UI components (app/
    page.tsx, app/dashboard/lottery/page.tsx:15).
  - Business logic is mostly in server actions:
      - Entry flow: lib/actions/lottery.actions.ts:15
      - Draw flow: lib/actions/lottery-draw.actions.ts:36
      - Read/query flow: lib/actions/lottery-query.actions.ts:11
  - Data layer is MongoDB with typed collection helpers and shared connection cache (lib/
    mongodb.ts:35, lib/mongodb.ts:49).
  - Email integration via Resend is embedded in draw flow (lib/email.ts:1, lib/actions/
    lottery-draw.actions.ts:117).
  - Operational index setup is explicit (lib/setup-indexes.ts:10, scripts/setup-db.ts:1).
  - Date partitioning is timezone-aware for Canmore (lib/date.ts:3, lib/date.ts:8).

  Is it structured well for scaling?
  Short answer: good for MVP / small-to-medium traffic, but not production-hard at scale
  yet.

  Main strengths:

  - Clean separation of concerns (actions, queries, db helpers).
  - Sensible Mongo connection reuse and indexing.
  - Dynamic admin data fetching in parallel (app/dashboard/lottery/page.tsx:17).

  Main scaling risks:

  1. No auth/authorization on admin/debug surfaces
      - Admin and setup pages are directly routable (app/admin/setup-db/page.tsx:9).
      - Debug/env endpoints expose internal info (app/api/test-env/route.ts:3, app/api/
        debug-db/route.ts:4).
  2. Duplicate registration race condition
      - Entry checks then inserts (lib/actions/lottery.actions.ts:47, lib/actions/
        lottery.actions.ts:63).
      - Index on { email, date } is not unique (lib/setup-indexes.ts:23), so concurrent
        writes can still duplicate.
  3. Draw is not atomic
      - “Already drawn?” check then later writes (lib/actions/lottery-draw.actions.ts:53,
        lib/actions/lottery-draw.actions.ts:157).
      - Two concurrent draw requests can both pass the check and create inconsistent
        tickets/winners.
  4. Email sending in request path
      - Bulk email is synchronous in draw request (lib/actions/lottery-
        draw.actions.ts:117).
      - At higher winner counts this becomes slow/timeout-prone; better as background
        queue/job.
5. No automated tests
      - No test script in package.json:5, so regression risk rises as complexity grows.
  6. Duplicate entry logic path
      - Similar registration logic exists in both server action and API route (lib/actions/
        lottery.actions.ts:15, app/api/registrants/route.ts:10), which can drift.



// // // // // // // // // // // // // // // Ticket Farm → SaaS Migration Plan // // // // // // // // // // // // // // // 

 Target

 Convert single-tenant lottery app into a multi-tenant SaaS for any organization running
 lotteries, queues, or ticket distributions. Broad market (non-profits, events, community
 orgs).

 ---
 Architecture Decisions

 Auth: Clerk
 - Native Next.js App Router + Server Actions support (auth() works directly in server
 actions)
 - Built-in Organizations with roles — no need to build membership/RBAC from scratch
 - <OrganizationProfile /> handles member invites, settings UI out of the box
 - 10k MAU free tier sufficient for early validation

 Multi-tenancy: Shared DB, orgId on every document
 - Add orgId: string (Clerk's org_xxx ID) to every document in every collection
 - All indexes gain orgId as the leading key
 - No MongoDB round-trip needed to resolve org — Clerk JWT already contains orgId
 - Per-tenant DB isolation is a later migration if compliance requires it

 Billing: Stripe Subscriptions
 - Stripe Checkout + Customer Portal (no custom payment UI to build)
 - Store stripeCustomerId + subscriptionStatus + planName on Organization document

 Recommended Pricing Tiers:
 | Tier    | Price   | Limits                                                    |
 |---------|---------|-----------------------------------------------------------|
 | Free    | $0      | 100 registrants/lottery, Ticket Farm branding             |
 | Starter | $29/mo  | 500 registrants/lottery, custom org name + timezone       |
 | Growth  | $79/mo  | 2,000 registrants/lottery, custom email domain, analytics |
 | Scale   | $199/mo | Unlimited, API access, custom templates                   |

 Flat monthly tiers (not per-registrant) because non-profits can't control volume.

 ---
 New Data Models

 Organization (new collection: organizations)

 interface Organization {
   _id?: ObjectId;
   clerkOrgId: string;          // Primary external key, from Clerk
   name: string;
   slug: string;                // URL slug, unique ("canmore-food-recovery")
   timezone: string;            // IANA timezone ("America/Edmonton")
   publicPageEnabled: boolean;
   emailFromName: string;
   emailFromAddress: string;    // Resend verified sender
   stripeCustomerId?: string;
   stripePriceId?: string;
   subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "free";
   planName: "free" | "starter" | "growth" | "scale";
   maxRegistrantsPerLottery: number;
   createdAt: Date;
   updatedAt: Date;
 }

 Updated existing models (add orgId: string to all three)

 - Registrant — add orgId
 - Lottery — add orgId
 - Ticket — add orgId

 Updated Indexes (orgId as leading key on all)

 registrants:   { orgId, email, date }  unique=true   ← also fixes race condition
 registrants:   { orgId, date, enteredAt }
 lotteries:     { orgId, date }         unique=true
 tickets:       { orgId, date, status, ticketNumber }
 tickets:       { ticketId }            unique=true   (unchanged)
 tickets:       { orgId, email, date }
 organizations: { clerkOrgId }          unique=true
 organizations: { slug }                unique=true

 ---
 Critical Bugs to Fix (Phase 0 — before any SaaS work)

 Bug 1: Duplicate Registration Race Condition

 File: lib/actions/lottery.actions.ts:47-63, lib/setup-indexes.ts:23
 - The findOne + insertOne pattern has a TOCTOU race condition
 - Fix: Make { email, date } index unique: true. Catch MongoDB E11000 in insertOne. Remove
  the findOne pre-check entirely.

 Bug 2: Non-Atomic Lottery Draw

 File: lib/actions/lottery-draw.actions.ts:52-172
 - "Already drawn?" check at line 53 is separate from the lottery upsert at line 157 — two
  concurrent requests both pass the check
 - Fix: Move lottery status update to be the first DB operation using findOneAndUpdate
 with { status: { $ne: "LOTTERY_DRAWN" } } as filter. If no document matches, another draw
  won the race — abort early.

 Bug 3: Synchronous Email Blocks Draw Response

 File: lib/actions/lottery-draw.actions.ts:107-139
 - sendBulkWinnerEmails is awaited synchronously — risks Vercel timeout with many winners
 - Phase 0 fix: Fire-and-forget via a separate Route Handler
 (/api/notifications/send-winner-emails)
 - Phase 4 fix: Move to Inngest background job

 Bug 4: Duplicate Registration Logic

 Files: lib/actions/lottery.actions.ts, app/api/registrants/route.ts
 - Same logic in two places will diverge
 - Fix: Delete app/api/registrants/route.ts. Server Action is the canonical path.

 Bug 5: Public Debug/Setup Endpoints Exposed

 Files: app/api/debug-db/route.ts, app/api/test-env/route.ts, app/admin/setup-db/page.tsx
 - Fix: Delete all three. DB setup belongs in scripts/setup-db.ts (already exists).

 ---
 Phased Implementation

 Phase 0 — Pre-SaaS Hardening

 Fix critical bugs. Ships to production for Canmore immediately.

 - Fix unique index + E11000 catch in lib/setup-indexes.ts +
 lib/actions/lottery.actions.ts
 - Fix atomic draw lock in lib/actions/lottery-draw.actions.ts
 - Delete app/api/registrants/route.ts
 - Delete app/api/debug-db/, app/api/test-env/, app/admin/setup-db/
 - Fire-and-forget email sending (basic async decoupling)

 Phase 1 — Auth Foundation

 Add Clerk. Still single-tenant. Admin area protected.

 New files:
 - middleware.ts — Clerk middleware protecting /dashboard/*, /admin/*, /org/*
 - app/(auth)/sign-in/[[...sign-in]]/page.tsx
 - app/(auth)/sign-up/[[...sign-up]]/page.tsx

 Modified files:
 - app/layout.tsx — wrap with <ClerkProvider>
 - components/nav-user.tsx — replace static user data with <UserButton />
 - lib/actions/lottery-draw.actions.ts — add auth() guard at top
 - lib/actions/lottery-query.actions.ts — add auth() guard at top

 New env vars: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, redirect URLs

 Phase 2 — Multi-Tenancy

 Introduce Organization model. Every query becomes org-scoped.

 New files:
 - lib/actions/org.actions.ts — createOrganization(), getOrganization(),
 updateOrganizationSettings()
 - lib/org-context.ts — requireOrgId() helper (calls auth(), returns orgId)
 - scripts/migrate-add-orgid.ts — backfills orgId on all existing documents for Canmore
 - app/(dashboard)/onboarding/page.tsx — new org wizard (name, timezone, pickup details)
 - app/(dashboard)/org/settings/page.tsx — ongoing settings
 - app/[orgSlug]/page.tsx — tenant-scoped public registration page
 - app/[orgSlug]/winners/page.tsx — tenant-scoped winners page

 Modified files:
 - lib/types.ts — add Organization interface; add orgId to Registrant, Lottery, Ticket
 - lib/mongodb.ts — add getOrganizationsCollection()
 - lib/setup-indexes.ts — rebuild all indexes with orgId as leading key
 - lib/date.ts — getTodayDateString(timezone: string) instead of hardcoded Canmore
 timezone
 - lib/email.ts — accept orgEmailFrom, orgEmailFromName params
 - emails/winner-ticket-email.tsx — remove hardcoded "Canmore" strings; accept orgName,
 pickupLocation props
 - lib/actions/lottery.actions.ts — resolve orgSlug → orgId, enforce plan limits
 - lib/actions/lottery-draw.actions.ts — call requireOrgId(), scope all queries
 - lib/actions/lottery-query.actions.ts — call requireOrgId(), scope all queries
 - components/registration-form.tsx — accept orgSlug prop, pass to server action

 Middleware addition: redirect new orgs (no Organization document) to /onboarding

 Phase 3 — Billing

 Stripe integration. Gate features by plan tier.

 New files:
 - lib/stripe.ts — Stripe client singleton + getOrCreateStripeCustomer()
 - lib/plan-limits.ts — plan limit constants
 - app/(dashboard)/billing/page.tsx — current plan + usage + upgrade CTA
 - app/api/billing/create-checkout/route.ts — Stripe Checkout session
 - app/api/billing/create-portal/route.ts — Stripe Customer Portal session
 - app/api/webhooks/stripe/route.ts — handles subscription lifecycle events; updates
 Organization.subscriptionStatus

 Modified files:
 - lib/actions/lottery.actions.ts — count today's registrants before insert; reject if
 over plan limit
 - lib/actions/org.actions.ts — create Stripe Customer during onboarding; set 14-day trial

 New env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, price IDs

 Phase 4 — Production Polish

 Marketing site, async email queue, analytics, check-in.

 New files:
 - app/page.tsx — convert from Canmore registration to Ticket Farm marketing/landing page
 - inngest/functions/send-winner-emails.ts — background email job
 - app/api/inngest/route.ts — Inngest serve handler
 - app/(dashboard)/analytics/page.tsx — lottery history charts (Growth+ plan only)
 - app/(dashboard)/checkin/page.tsx — ticket check-in by ID (status: ACTIVE → CHECKED_IN)
 - app/(dashboard)/org/members/page.tsx — embed <OrganizationProfile />
 - lib/actions/analytics.actions.ts — getLotteryHistory(orgId, days) aggregation

 Modified files:
 - lib/actions/lottery-draw.actions.ts — emit Inngest event instead of calling
 sendBulkWinnerEmails directly

 ---
 New Routes Summary

 /                           Platform marketing page          (Phase 4)
 /sign-in                    Clerk sign-in                   (Phase 1)
 /sign-up                    Clerk sign-up                   (Phase 1)
 /onboarding                 New org setup wizard             (Phase 2)
 /[orgSlug]                  Public registration (per org)    (Phase 2)
 /[orgSlug]/winners          Public winners (per org)         (Phase 2)
 /org/settings               Org branding + timezone          (Phase 2)
 /org/members                Clerk OrganizationProfile        (Phase 4)
 /billing                    Plan + Stripe portal             (Phase 3)
 /analytics                  Lottery history                  (Phase 4)
 /checkin                    Ticket check-in scanner          (Phase 4)
 /api/webhooks/stripe        Stripe webhook receiver          (Phase 3)
 /api/inngest                Inngest handler                  (Phase 4)
 /api/billing/create-checkout  Checkout session               (Phase 3)
 /api/billing/create-portal    Portal session                 (Phase 3)

 ---
 Critical Files (in order of modification)

 1. lib/types.ts — all new interfaces; every other change cascades from here
 2. lib/setup-indexes.ts — rebuild indexes; must run migration script first or queries
 break
 3. lib/mongodb.ts — add getOrganizationsCollection()
 4. lib/actions/lottery.actions.ts — race condition fix + org scoping + plan limits
 converge here
 5. lib/actions/lottery-draw.actions.ts — most complex: atomic lock + email decoupling +
 org scoping
 6. lib/actions/lottery-query.actions.ts — all read queries need org scoping
 7. lib/date.ts — timezone param change cascades to all callers
 8. emails/winner-ticket-email.tsx — remove hardcoded Canmore branding
 9. middleware.ts — new file; gates all admin/org routes behind Clerk auth

 ---
 Phase Dependencies

 Phase 0 (Bug fixes) → Phase 1 (Auth) → Phase 2 (Multi-tenancy) → Phase 3 (Billing) →
 Phase 4 (Polish)
 Phases 0 and 1 can ship to production for Canmore without disruption. Phase 2 requires
 the
 data migration script to run before rebuilding indexes.