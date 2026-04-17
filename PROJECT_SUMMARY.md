# Ticket Farm — Project Summary for LLM Context

## What It Is

A multi-tenant SaaS lottery/ticket platform built on Next.js. Organizations run daily lotteries where members of the public register, winners are drawn randomly, and tickets (with pickup details) are emailed to winners. Originally a single-tenant app; migrated to SaaS with Phases 0–3 complete.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, React 19, React Compiler) |
| Language | TypeScript 5 (strict mode) |
| Auth | Clerk (`@clerk/nextjs`) — users + organizations + roles |
| Database | MongoDB Atlas — shared DB, `orgId`-scoped collections |
| Payments | Stripe — subscriptions, webhooks, customer portal |
| Background jobs | Inngest — durable email queue |
| Email | Resend + React Email templates |
| UI | Shadcn/ui (new-york), Radix UI, Tailwind CSS v4 |
| Table | TanStack Table v8 |
| Charts | Recharts |
| Validation | Zod v4 |
| Package manager | pnpm |
| Deployment | Vercel |

---

## Architecture

### Multi-Tenancy Model

- **One MongoDB database**, all documents carry an `orgId` field (Clerk `org_xxx` string).
- All indexes are **orgId-leading**: `{ orgId, date }`, `{ orgId, email, date }`, etc.
- **Authenticated routes**: `auth()` → `orgId` directly, no DB lookup.
- **Public routes**: slug → MongoDB lookup → **LRU in-process cache** (500 entries, 5-min TTL).

### Collections

| Collection | Key Fields | Notable Indexes |
|------------|-----------|-----------------|
| `registrants` | orgId, name, email, date (YYYY-MM-DD), enteredAt | `{ orgId, email, date }` unique |
| `lotteries` | orgId, date, status, registrantCount, maxTicketsAvailable | `{ orgId, date }` unique |
| `tickets` | orgId, ticketId (6-digit unique), ticketNumber, status | `{ ticketId }` unique |
| `organizations` | clerkOrgId, slug, subscriptionStatus, planName, maxRegistrantsPerDay | `{ clerkOrgId }` unique, `{ slug }` unique |
| `processed_webhook_events` | stripeEventId | `{ stripeEventId }` unique |

### Key Invariants

1. **Atomic quota**: `Lottery.registrantCount` incremented with `findOneAndUpdate` + `$inc + $lt` guard. Rolled back on registrant insert failure.
2. **Duplicate registration prevention**: Unique index `{ orgId, email, date }` on registrants. E11000 caught and returned as user-friendly error (with jittered retry for race conditions).
3. **Atomic draw lock**: `updateOne({ status: { $ne: "LOTTERY_DRAWN" } })` prevents double-draws.
4. **Idempotent Stripe webhooks**: Events stored in `processed_webhook_events`. Out-of-order protection via `{ statusUpdatedAt: { $lt: event.created } }` conditional filter.
5. **Async email**: Draw emits `lottery/draw.completed` Inngest event. Emails sent outside HTTP lifecycle (no Vercel timeout risk). Tracks `emailSent`, `emailSentAt`, `emailError` per ticket.

### Subscription Plans

| Plan | Price | Daily registrant limit |
|------|-------|----------------------|
| free | $0 | 100 |
| starter | $29/mo | 500 |
| growth | $79/mo | 2,000 |
| scale | $199/mo | Unlimited |

**Subscription states**: `trialing` → `active` → `past_due` → `canceled`

**Entitlement guards**:
- `trialing` / `active`: Full access
- `past_due`: Read-only dashboard; billing portal accessible; public registration still open
- `canceled`: Read-only; free-tier limits apply; public registration still open

---

## Directory Layout

```
ticket-farm/
├── app/
│   ├── (auth)/sign-in, sign-up         # Clerk auth pages
│   ├── (dashboard)/                    # Protected dashboard group
│   │   ├── billing/page.tsx            # Plan display + checkout links
│   │   ├── onboarding/page.tsx         # New org wizard (runs after sign-up)
│   │   └── org/settings/page.tsx       # Org settings (admin only)
│   ├── [orgSlug]/page.tsx              # Public registration page (per org)
│   ├── [orgSlug]/winners/page.tsx      # Public winners page (per org)
│   ├── admin/registrants/page.tsx      # Admin registrant list
│   ├── dashboard/lottery/page.tsx      # Main lottery admin dashboard
│   ├── ticket/[id]/page.tsx            # Ticket lookup
│   ├── winners/page.tsx                # All-time winners (legacy)
│   ├── api/
│   │   ├── billing/create-checkout/    # POST → Stripe Checkout URL
│   │   ├── billing/create-portal/      # POST → Stripe Portal URL
│   │   ├── inngest/                    # Inngest handler (GET/POST/PUT)
│   │   └── webhooks/stripe/            # Stripe webhook receiver
│   └── layout.tsx                      # Root layout with ClerkProvider
├── lib/
│   ├── actions/
│   │   ├── lottery.actions.ts          # enterLottery (public Server Action)
│   │   ├── lottery-draw.actions.ts     # drawTodayLottery (admin Server Action)
│   │   ├── lottery-query.actions.ts    # getTodayStats/Registrants/Winners
│   │   └── org.actions.ts             # createOrg, getOrg, updateSettings
│   ├── authz.ts                        # requireRole(), requireActiveSub()
│   ├── date.ts                         # getTodayDateString(timezone)
│   ├── email.ts                        # sendWinnerEmail(), sendBulkWinnerEmails()
│   ├── mongodb.ts                      # Singleton client + typed collection helpers
│   ├── org-cache.ts                    # LRU slug→orgId cache (500 entries, 5min TTL)
│   ├── plan-limits.ts                  # Plan constants, getPlanFromPriceId()
│   ├── setup-indexes.ts                # Index creation (called at server startup)
│   ├── stripe.ts                       # Stripe singleton, getOrCreateStripeCustomer()
│   └── types.ts                        # All TypeScript interfaces
├── components/
│   ├── lottery/                        # Draw panel, stats cards, registrants table
│   ├── ui/                             # 38 Shadcn/ui components
│   ├── billing-actions.tsx             # Client-side billing buttons
│   ├── onboarding-form.tsx             # Multi-step org setup form
│   ├── org-settings-form.tsx           # Settings update form
│   └── registration-form.tsx           # Public lottery entry form
├── emails/
│   └── winner-ticket-email.tsx         # React Email winner notification template
├── inngest/
│   ├── client.ts                       # Inngest client init
│   └── functions/send-winner-emails.ts # Durable email sending function
├── scripts/
│   ├── setup-db.ts                     # Run indexes (npm run setup-db)
│   └── migrate-add-orgid.ts           # Phase 2 backfill (SEED_ORG_ID=xxx)
└── middleware.ts                       # Clerk route protection
```

---

## Authorization

```
requireRole('org:admin')  — drawTodayLottery, org settings, billing
requireRole('org:member') — view registrants, view stats
Public                    — registration form, winners page
```

Roles are hierarchical: `org:admin` satisfies `org:member` check.

---

## Environment Variables

```bash
MONGODB_URI
MONGODB_DB_NAME

RESEND_API_KEY

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/lottery
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/onboarding

STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_STARTER_PRICE_ID
STRIPE_GROWTH_PRICE_ID
STRIPE_SCALE_PRICE_ID

INNGEST_EVENT_KEY          # (implicit via Inngest SDK)
INNGEST_SIGNING_KEY        # (implicit via Inngest SDK)
```

---

## What's Implemented (Phases 0–3)

- **Phase 0**: Race condition fixes (unique indexes, E11000 catch), atomic draw lock, deleted debug endpoints.
- **Phase 1**: Clerk auth, route middleware, role-based Server Action guards, `<UserButton />` in nav.
- **Phase 2**: Organization model, orgId on all documents, per-org public pages, onboarding wizard, org settings, org slug LRU cache, Inngest email queue, migration script.
- **Phase 3**: Stripe subscriptions (4 tiers), checkout + portal API routes, webhook handler with idempotency + out-of-order guard, billing dashboard page, subscription state enforcement on write actions.

---

## What's NOT Implemented (Phase 4)

- `app/page.tsx` — Marketing/landing page with pricing table
- `app/(dashboard)/analytics/page.tsx` — Growth+ only analytics (currently shows placeholder charts)
- `app/(dashboard)/checkin/page.tsx` — Ticket check-in scanner (update `tickets.status` → `CHECKED_IN`)
- `app/(dashboard)/org/members/page.tsx` — Clerk `<OrganizationProfile />` embed for member management

---

## Known Rough Edges / Possible Improvements

1. **org-cache is per-instance**: Slug changes (rare) take up to 5 min to propagate across all Vercel instances. Acceptable trade-off; could use Redis for instant invalidation if needed.

2. **No rate limiting on public registration**: The registration endpoint has quota enforcement but no IP-based rate limiting. A bad actor could spam different emails to exhaust the quota.

3. **Ticket check-in not implemented**: `tickets.status = "CHECKED_IN"` field exists on the model but there's no UI or API to trigger it.

4. **Analytics page uses demo/placeholder data**: The `/dashboard` page has charts but they render static demo data, not real MongoDB aggregations.

5. **No webhook retry visibility**: Inngest retries failed emails up to 3 times but there's no admin UI to inspect email delivery failures (`ticket.emailError` is stored in DB but not surfaced).

6. **`app/page.tsx` just redirects**: Root `/` redirects to `/sign-in`. A marketing landing page with pricing is planned but not built.

7. **`app/ticket/[id]/page.tsx` shows mock data**: The ticket lookup page renders hardcoded mock data, not a real DB lookup by `ticketId`.

8. **Member management relies entirely on Clerk**: No custom member management UI — Phase 4 plans to embed Clerk's `<OrganizationProfile />`.

9. **`winners/page.tsx` (legacy)**: The root `/winners` page appears to be a legacy single-tenant page. Per-org winners live at `/[orgSlug]/winners`. The legacy page may conflict or need removal.

10. **No soft delete / audit log**: Tickets can be `CANCELED` in status but there's no admin UI to do so, and no audit trail for draw or status changes.
