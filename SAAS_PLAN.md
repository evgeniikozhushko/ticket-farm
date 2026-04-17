# Ticket Farm → SaaS Migration Plan

## Overview

Convert single-tenant lottery app into a multi-tenant SaaS for any organization running
lotteries, queues, or ticket distributions.

**Stack additions:** Clerk (auth + orgs), Stripe (billing), Inngest (background jobs)
**DB strategy:** Shared MongoDB, `orgId` field on every document, orgId-leading indexes

---

## Phase 0 — Pre-SaaS Hardening ✅ COMPLETE

- Fixed duplicate registration race condition: unique index on `{email, date}` + E11000 catch
- Fixed non-atomic lottery draw: `updateOne` with `{status: {$ne:"LOTTERY_DRAWN"}}` + upsert as atomic lock
- Deleted duplicate `app/api/registrants/route.ts` (Server Action is canonical path)
- Deleted exposed debug endpoints: `app/api/debug-db/`, `app/api/test-env/`, `app/admin/setup-db/`

---

## Phase 1 — Auth Foundation

*Add Clerk. Still single-tenant. Admin area protected.*

**New files:**
- `middleware.ts` — Clerk route protection
- `app/(auth)/sign-in/[[...sign-in]]/page.tsx`
- `app/(auth)/sign-up/[[...sign-up]]/page.tsx`
- `lib/authz.ts` — `requireRole('org:admin' | 'org:member')` helper

**Modified files:**
- `app/layout.tsx` — `<ClerkProvider>`
- `components/nav-user.tsx` — `<UserButton />`
- `lib/actions/lottery-draw.actions.ts` — `requireRole('org:admin')`
- `lib/actions/lottery-query.actions.ts` — `requireRole('org:member')`

**New env vars:** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, redirect URLs

---

## Phase 2 — Multi-Tenancy + Email Queue

*Organization model, orgId on every document, per-org public pages, Inngest.*

**Key new files:**
- `lib/org-cache.ts` — LRU slug→orgId cache (TTL 5min) for public routes
- `lib/actions/org.actions.ts` — createOrganization, getOrganization, updateOrganizationSettings
- `scripts/migrate-add-orgid.ts` — backfill orgId on existing Canmore documents
- `app/[orgSlug]/page.tsx` — public registration per org
- `app/[orgSlug]/winners/page.tsx` — public winners per org
- `app/(dashboard)/onboarding/page.tsx` — new org wizard
- `inngest/functions/send-winner-emails.ts` — durable email queue (replaces synchronous send)
- `app/api/inngest/route.ts`

**Data model changes:**
- Add `orgId: string` to `Registrant`, `Lottery`, `Ticket`
- Add `registrantCount: number` to `Lottery` (atomic quota counter)
- New `Organization` collection
- New `processed_webhook_events` collection (Phase 3 idempotency)
- Rebuild all indexes with `orgId` as leading key

**Zero-downtime rollout:** dual-write → backfill → create new indexes → switch reads → drop old indexes

**Tenancy resolution:**
- Authenticated routes: `auth()` → `orgId` (no DB lookup)
- Public routes: slug → MongoDB lookup → LRU cache (TTL 5min)

---

## Phase 3 — Billing

*Stripe subscriptions, atomic plan limits, webhook state machine.*

**New files:**
- `lib/stripe.ts` — Stripe client + getOrCreateStripeCustomer
- `lib/plan-limits.ts` — limit constants per plan tier
- `app/(dashboard)/billing/page.tsx`
- `app/api/billing/create-checkout/route.ts`
- `app/api/billing/create-portal/route.ts`
- `app/api/webhooks/stripe/route.ts`

**Pricing tiers:**
| Tier | Price | Daily registrant limit |
|------|-------|----------------------|
| Free | $0 | 100 |
| Starter | $29/mo | 500 |
| Growth | $79/mo | 2,000 |
| Scale | $199/mo | Unlimited |

**Atomic quota:** `findOneAndUpdate` with `$inc + $lt` guard + jittered retry (5 attempts, 20-100ms). Rollback on ANY `insertOne` failure.

**Webhook invariants:**
- Verify Stripe signature first (reject 400 if invalid)
- Resolve org by `stripeCustomerId`, not `clerkOrgId`
- Update org status BEFORE inserting processed event (org update first, idempotency record second)
- Out-of-order protection: conditional filter `{statusUpdatedAt: {$lt: event.created}}`

**Entitlement by status:**
| Status | Dashboard | Public registration |
|--------|-----------|-------------------|
| trialing / active | Full access | Open |
| past_due | Read-only; **billing portal open** | Open |
| canceled | Read-only; free tier limits | Open at free tier |

---

## Phase 4 — Production Polish

*Marketing page, analytics, ticket check-in, member management.*

- `app/page.tsx` → Ticket Farm landing page with pricing
- `app/(dashboard)/analytics/page.tsx` — Growth+ only
- `app/(dashboard)/checkin/page.tsx` — scan ticketId to check in
- `app/(dashboard)/org/members/page.tsx` — Clerk `<OrganizationProfile />`

---

## Authorization Matrix

| Action | org:admin | org:member | Public |
|--------|-----------|------------|--------|
| Register for lottery | — | — | ✅ |
| View winners | — | — | ✅ |
| View registrants | ✅ | ✅ | ❌ |
| Run draw | ✅ | ❌ | ❌ |
| Check in tickets | ✅ | ✅ | ❌ |
| View analytics | ✅ | ✅ | ❌ |
| Org settings | ✅ | ❌ | ❌ |
| Billing | ✅ | ❌ | ❌ |
| Manage members | ✅ | ❌ | ❌ |
