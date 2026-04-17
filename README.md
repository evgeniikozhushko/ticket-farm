# Ticket Farm

**Multi-tenant SaaS lottery & ticket management platform** — Organizations run daily lotteries where users register for free, winners are drawn automatically, and tickets are emailed with pickup details.

🔗 **Live Demo:** [ticket-farm.vercel.app](https://ticket-farm.vercel.app)

---

## 🎯 What It Does

- Organizations create a branded public registration page (e.g., `/my-org`)
- Daily lottery draws: register today → win tickets for tomorrow
- Winners receive email tickets with QR codes/pickup details
- Admin dashboard to view registrants, run draws, manage settings
- Subscription plans with tiered daily registration limits

---

## 🏗️ Architecture Highlights

| Aspect | Implementation |
|--------|---------------|
| **Multi-tenancy** | Shared MongoDB with `orgId` scoping; Clerk organizations for auth |
| **Race condition safety** | Atomic quotas, unique indexes, draw locks |
| **Email delivery** | Inngest durable queue — no Vercel timeout risks |
| **Billing** | Stripe subscriptions with webhook idempotency |
| **Performance** | LRU cache for org slug lookups (500 entries, 5-min TTL) |

---

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router, React 19, React Compiler)
- **Language:** TypeScript 5 (strict mode)
- **Auth:** Clerk (users + organizations + roles)
- **Database:** MongoDB Atlas
- **Payments:** Stripe (subscriptions, customer portal)
- **Background Jobs:** Inngest
- **Email:** Resend + React Email
- **UI:** Shadcn/ui, Radix UI, Tailwind CSS v4
- **Tables:** TanStack Table v8
- **Charts:** Recharts
- **Validation:** Zod v4
- **Package Manager:** pnpm
- **Deployment:** Vercel

---

## 📊 Subscription Plans

| Plan | Price | Daily registrant limit |
|------|-------|----------------------|
| Free | $0 | 100 |
| Starter | $29/mo | 500 |
| Growth | $79/mo | 2,000 |
| Scale | $199/mo | Unlimited |

**State handling:** `trialing`/`active` = full access; `past_due` = read-only dashboard; `canceled` = free-tier limits apply.

---

## 🔐 Authorization

- `org:admin` — Run draws, edit settings, access billing
- `org:member` — View registrants and stats
- Public — Registration form and winners page

Roles are hierarchical (admin satisfies member checks).

---

## 🚀 Key Technical Features

### Data Integrity
- **Atomic quota enforcement:** `findOneAndUpdate` with `$inc + $lt` guard prevents over-registration
- **Duplicate prevention:** Unique index `{ orgId, email, date }` with jittered retry for race conditions
- **Draw locking:** `updateOne({ status: { $ne: "LOTTERY_DRAWN" } })` prevents double-draws
- **Idempotent webhooks:** Stripe events deduplicated with out-of-order protection

### Performance
- All database indexes are `orgId`-leading for query isolation
- Public slug lookups use in-process LRU cache (no DB roundtrip per request)
- Authenticated routes get `orgId` directly from Clerk session

### Email Reliability
- Draws emit Inngest events → emails sent outside HTTP lifecycle
- Tracks `emailSent`, `emailSentAt`, `emailError` per ticket
- Automatic retries on failure

---

## 📁 Project Structure (Key Files)