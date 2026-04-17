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

 Ticket Farm → SaaS Migration Plan (v2)

 Status

 - Phase 0 — DONE (unique index, atomic draw lock, deleted debug/duplicate routes)
 - Phase 1 — IN PROGRESS
 - Next action: create SAAS_PLAN.md in project root summarizing all phases, then implement
  Phase 1

 ---
 Architecture Decisions

 Auth: Clerk
 - auth() works directly inside Server Actions (the dominant pattern in this codebase)
 - Built-in Organizations with org:admin / org:member roles — no custom RBAC to build
 - <OrganizationProfile /> handles member invites out of the box
 - 10k MAU free tier covers early validation

 Multi-tenancy: Shared DB, orgId on every document
 - orgId = Clerk's org_xxx string — no extra DB lookup on authenticated routes
 - All indexes gain orgId as the leading key
 - Per-tenant DB isolation is a future migration if compliance requires it

 Tenancy Resolution Policy (two distinct paths — must not be conflated):

 | Context                                        | How orgId is obtained
                                                    |
 |------------------------------------------------|---------------------------------------
 ---------------------------------------------------|
 | Authenticated dashboard routes                 | const { orgId } = auth() — zero DB
 round-trip                                            |
 | Public routes (/[orgSlug], /[orgSlug]/winners) | slug → orgId lookup against
 organizations collection + in-process LRU cache (TTL ~5 min) |

 The cache layer (lib/org-cache.ts) must be implemented in Phase 2 alongside the public
 routes. Cache miss → DB read → cache set. Never expose the cache to authenticated
 mutation paths.

 Slug change invalidation: When updateOrganizationSettings() changes an org's slug, it
 must explicitly invalidate both the old and the new slug from the cache before returning:
 orgCache.delete(oldSlug);   // remove stale entry
 orgCache.delete(newSlug);   // remove any prior entry that claimed this slug
 Multi-instance limitation: In a Vercel deployment each serverless function instance has
 its own in-process cache. Invalidating one instance does not propagate to others.
 Residual TTL (≤5 min) is the only guarantee for other instances. This is acceptable for
 slug changes (low-frequency admin action). Document this explicitly in lib/org-cache.ts
 and in the settings UI ("Slug changes take up to 5 minutes to fully propagate across all
 servers").

 Billing: Stripe Subscriptions
 - Stripe Checkout + Customer Portal (no custom payment UI)
 - stripeCustomerId + subscriptionStatus + planName on Organization document

 Pricing Tiers:
 | Tier    | Price   | Registrant limit | Notes                          |
 |---------|---------|------------------|--------------------------------|
 | Free    | $0      | 100/day          | Ticket Farm branding on emails |
 | Starter | $29/mo  | 500/day          | Custom org name + timezone     |
 | Growth  | $79/mo  | 2,000/day        | Custom email domain, analytics |
 | Scale   | $199/mo | Unlimited        | API access, custom templates   |

 Important assumption: One lottery per day per org. "Registrants per lottery" =
 "registrants per day per org." If multiple-lotteries-per-day is ever needed, lotteryId
 must be added to Registrant and Ticket and indexes updated — revisit before implementing
 plan limits.

 ---
 Authorization Matrix

 Defined upfront to prevent auth/authorization drift across phases. Clerk roles:
 org:admin, org:member.

 | Action                | org:admin | org:member | Unauthenticated               |
 |-----------------------|-----------|------------|-------------------------------|
 | Register for lottery  | —         | —          | ✅ (public /[orgSlug])         |
 | View winners          | —         | —          | ✅ (public /[orgSlug]/winners) |
 | View registrants list | ✅         | ✅          | ❌                             |
 | Run lottery draw      | ✅         | ❌          | ❌                             |
 | Cancel / reset draw   | ✅         | ❌          | ❌                             |
 | Check in tickets      | ✅         | ✅          | ❌                             |
 | View analytics        | ✅         | ✅          | ❌                             |
 | Manage org settings   | ✅         | ❌          | ❌                             |
 | Manage billing        | ✅         | ❌          | ❌                             |
 | Manage members        | ✅         | ❌          | ❌                             |

 Implementation: Create lib/authz.ts with requireRole(minRole: 'org:member' | 'org:admin')
  that calls auth() and checks orgRole. Call it at the top of every admin Server Action
 (draw, settings, billing).

 ---
 New Data Models

 Organization (new collection: organizations)

 interface Organization {
   _id?: ObjectId;
   clerkOrgId: string;          // Primary external key (Clerk org_xxx)
   name: string;
   slug: string;                // URL slug, unique
   timezone: string;            // IANA timezone ("America/Edmonton")
   publicPageEnabled: boolean;
   emailFromName: string;
   emailFromAddress: string;    // Resend verified sender
   stripeCustomerId?: string;
   stripePriceId?: string;
   subscriptionStatus: "trialing" | "active" | "past_due" | "canceled" | "free";
   statusUpdatedAt?: Date;      // Timestamp of last Stripe status event — used for 
 out-of-order protection
   planName: "free" | "starter" | "growth" | "scale";
   maxRegistrantsPerDay: number; // Enforced atomically (see plan-limit section)
   createdAt: Date;
   updatedAt: Date;
 }

 Updated Registrant / Lottery / Ticket — add orgId: string to all three

 Lottery document gains quota counter (for atomic plan-limit enforcement)

 interface Lottery {
   // ...existing fields...
   orgId: string;          // NEW
   registrantCount: number; // NEW — incremented atomically on each registration
 }

 Updated Indexes

 registrants:   { orgId, email, date }  unique=true
 registrants:   { orgId, date, enteredAt }
 lotteries:     { orgId, date }         unique=true
 tickets:       { orgId, date, status, ticketNumber }
 tickets:       { ticketId }            unique=true
 tickets:       { orgId, email, date }
 organizations: { clerkOrgId }          unique=true
 organizations: { slug }                unique=true
 processed_webhook_events: { stripeEventId }  unique=true

 processed_webhook_events (new collection)

 interface ProcessedWebhookEvent {
   _id?: ObjectId;
   stripeEventId: string;   // e.g. "evt_1abc..."
   processedAt: Date;
 }
 Unique index on { stripeEventId } ensures idempotency. Add to lib/setup-indexes.ts in
 Phase 3 alongside other index creation. No TTL needed — storage cost is negligible (one
 doc per Stripe event, events are infrequent).

 ---
 Atomic Plan-Limit Enforcement

 The "count then insert" pattern used in Phase 3 is race-prone (same TOCTOU flaw as the
 duplicate registration bug). Fix: use a registrantCount field on the Lottery document and
  increment it atomically with a conditional guard.

 Registration flow with atomic quota (Phase 3):

 // Step 1: Atomically claim a quota slot on the Lottery document.
 // Do NOT include registrantCount in $setOnInsert — $inc alone initializes
 // it to 1 on new documents (MongoDB treats missing field as 0). Combining
 // $inc and $setOnInsert on the same field is invalid and causes double-write.
 //
 // Wrapped in a bounded retry with jittered backoff: concurrent first registrations
 // of the day can both attempt the upsert and one will get E11000. On retry the
 // document exists and $inc succeeds normally. Jitter avoids thundering herd on spikes.
 // Log a warning on retry exhaustion for monitoring.
 let quotaResult = null;
 const MAX_QUOTA_RETRIES = 5;
 for (let attempt = 0; attempt < MAX_QUOTA_RETRIES; attempt++) {
   try {
     quotaResult = await lotteriesCollection.findOneAndUpdate(...);
     break;
   } catch (err) {
     if ((err as { code?: number }).code === 11000 && attempt < MAX_QUOTA_RETRIES - 1) {
       // Jittered backoff: 20-100ms
       await new Promise(r => setTimeout(r, 20 + Math.random() * 80));
       continue;
     }
     if ((err as { code?: number }).code === 11000) {
       console.error("[quota] retry exhausted after", MAX_QUOTA_RETRIES, "attempts"); //
 eslint-disable-line no-console
     }
     throw err;
   }
 }

 // If null: quota full (or lottery already drawn)
 if (!quotaResult) return { success: false, error: "Registration is full for today." };

 // Step 2: Insert registrant — roll back quota slot on ANY failure, not only E11000.
 try {
   await registrantsCollection.insertOne(newRegistrant);
 } catch (err) {
   // Roll back the quota slot we claimed above (best-effort; quota may be off by 1
   // if this decrement also fails, which is an acceptable rare edge case).
   await lotteriesCollection.updateOne({ orgId, date }, { $inc: { registrantCount: -1 }
 });

   if (typeof err === "object" && err !== null && "code" in err && (err as { code: number
 }).code === 11000) {
     return { success: false, error: "You've already entered today's lottery." };
   }
   throw err;
 }

 Rollback invariant: The quota decrement runs on ALL insert failures — network errors,
 write timeouts, validation errors, and duplicate key. This keeps registrantCount accurate
  as a single source of truth. The only unrecoverable case is if the rollback itself fails
  after the insert also failed — in that case the counter is off by +1, which is a
 self-healing error (the next day resets to 0).

 ---
 Stripe Webhook Invariants

 Webhook handler at app/api/webhooks/stripe/route.ts must satisfy:

 1. Signature verification — first line: stripe.webhooks.constructEvent(rawBody, sig, 
 STRIPE_WEBHOOK_SECRET). Reject without verified signature with 400.
 2. Idempotency — Stripe retries on 5xx. Store stripeEventId in a processed_webhook_events
  collection with a unique index. Skip if already processed; return 200.

 2. Write order matters: Update organizations first, then insert into
 processed_webhook_events. Never the reverse. If the insertion fails after a successful
 org update, Stripe retries; the statusUpdatedAt conditional filter makes the re-applied
 org update a no-op (no state drift). If the org update is inserted first as "processed"
 but the org write then fails, that event is permanently skipped — unrecoverable. The
 statusUpdatedAt guard serves as a secondary idempotency layer; processed_webhook_events
 is the primary gate to avoid redundant processing entirely.
 3. Out-of-order event handling — Stripe webhook payloads are keyed by Stripe identifiers
 (customer, subscription), not Clerk IDs. Resolution must happen before the status update:
 // Step A: resolve org by Stripe customer ID (not clerkOrgId)
 const stripeCustomerId = event.data.object.customer;   // or event.data.object.id
 const org = await orgsCollection.findOne({ stripeCustomerId });
 if (!org) return; // unknown customer, skip

 // Step B: apply status update only if this event is newer than last seen
 const eventTs = new Date(event.created * 1000);
 await orgsCollection.updateOne(
   {
     stripeCustomerId,
     $or: [
       { statusUpdatedAt: { $exists: false } },
       { statusUpdatedAt: { $lt: eventTs } },
     ],
   },
   {
     $set: { subscriptionStatus: newStatus, statusUpdatedAt: eventTs },
   }
 );
 3. $max alone does not protect $set — both operators are applied independently. The
 conditional filter on statusUpdatedAt ensures the entire $set is a no-op when the event
 is older than current state.
 4. Entitlement state machine — Explicit behavior per status for both dashboard and public
  routes:

 | subscriptionStatus | Dashboard actions

       | Public /[orgSlug] registration | Notes
                                                           |
 |--------------------|-------------------------------------------------------------------
 -----------------------------------------------------------------------------------------
 ------|--------------------------------|-------------------------------------------------
 ----------------------------------------------------------|
 | trialing           | Full

       | ✅ Open                         | Full plan features during trial
                                                            |
 | active             | Full

       | ✅ Open                         | —
                                                            |
 | past_due           | Read-only (view only; draw and settings changes blocked). Billing 
 portal remains open — blocking it prevents payment recovery. Show payment banner in
 dashboard. | ✅ Open                         | Public registration intentionally kept
 open — participants should not be penalized for org's payment lag. |
 | canceled           | Read-only

       | ✅ Open at free tier limits     | Downgrade to free plan limits; registration cap
  reduced immediately                                       |
 | free               | Full at free tier limits

       | ✅ Open at free tier limits     | —
                                                            |

 Rationale for keeping public registration open on past_due/canceled: the org's billing
 failure should not strand participants who show up to register. The org loses the ability
  to run draws and manage settings until payment is resolved.

 Events to handle: checkout.session.completed, customer.subscription.created,
 customer.subscription.updated, customer.subscription.deleted, invoice.payment_failed.

 Residual implementation notes:
 - All downstream side effects triggered from webhook processing must be idempotent and
 gated by statusUpdatedAt or an equivalent guard. A failed processed_webhook_events
 insertion causes a Stripe retry, which will re-execute the handler.
 - Add one explicit test for quota retry exhaustion: simulate E11000 persisting across all
  5 attempts; verify the error is logged and the correct exception is thrown (not silently
  swallowed).

 ---
 Zero-Downtime Migration Sequence (Phase 2)

 Deploying orgId to a live app requires ordering to avoid query breakage. Do NOT add the
 new orgId-leading indexes before the backfill completes.

 Safe rollout order:

 1. Deploy Phase 1 first (auth only, no data model changes). No migration needed.
 2. Phase 2 deployment — three-step rollout:

 2. Step A — Dual-write (deploy app change): All new writes include orgId. Old documents
 without orgId still exist. Old indexes still serve reads. No reads break.

 2. Step B — Backfill (run script before indexing):
 pnpm migrate-add-orgid
 2. Script: scripts/migrate-add-orgid.ts — sets orgId = SEED_ORG_ID on all documents where
  orgId does not exist. Run as a one-off operation. Verify 0 documents remain without
 orgId before proceeding.

 2. Step C — Create new indexes first (after backfill confirmed complete):
   - Create new orgId-leading indexes with background: true (builds without blocking
 writes)
   - Do NOT drop old indexes yet — they still serve live queries during index build
   - Verify build completes in Atlas UI (index shows as ready) before proceeding

 Step D — Switch reads (deploy app change): All queries now filter by orgId. At this point
  both old and new indexes exist; MongoDB will use whichever the query planner selects.

 Step E — Drop old indexes (only after Step D is stable in production):
   - Confirm via Atlas query performance panel that old indexes are no longer being used
   - Then drop: email_date_idx on registrants, old date_unique_idx on lotteries, etc.
   - Dropping first then building creates a window of full collection scans — never do
 this order.

 ---
 Testing Gates (per phase)

 No test framework currently exists. Add vitest as the test runner.

 Phase 1 gate (before shipping auth to prod):
 - Unit: requireRole('org:admin') throws on org:member and unauthenticated
 - Unit: middleware allows public routes, blocks protected routes for unauthenticated

 Phase 2 gate:
 - Unit: enterLottery — duplicate email returns E11000 error message, not 500
 - Unit: drawTodayLottery — concurrent draws: second call returns "already drawn" (mock
 updateOne to simulate E11000)
 - Integration: getOrgBySlug() — cache miss hits DB, cache hit skips DB

 Phase 3 gate:
 - Unit: plan-limit quota — 100th registration succeeds, 101st fails with quota error
 - Unit: quota counter rollback — any insertOne failure triggers $inc: -1; E11000
 specifically returns "already registered" user message (not a 500)
 - Contract: Stripe webhook — customer.subscription.updated updates subscriptionStatus;
 duplicate event is idempotent

 New file: scripts/setup-db.ts already exists — add index verification step to confirm all
  expected indexes are present after migration.

 ---
 Phased Implementation

 Phase 0 — Pre-SaaS Hardening ✅ DONE

 - Fix unique index + E11000 catch (lib/setup-indexes.ts, lib/actions/lottery.actions.ts)
 - Fix atomic draw lock (lib/actions/lottery-draw.actions.ts)
 - Delete app/api/registrants/route.ts
 - Delete app/api/debug-db/, app/api/test-env/, app/admin/setup-db/

 Note: Email sending is still synchronous (await sendBulkWinnerEmails). Inngest moves to
 Phase 2 below — do not implement fire-and-forget via route handler (unreliable in
 serverless).

 ---
 Phase 1 — Auth Foundation

 Add Clerk. Still single-tenant. Admin area protected. Auth gates + role checks added.

 New files:
 - middleware.ts — Clerk middleware. Protect /dashboard/*, /admin/*, /org/*, /billing,
 /onboarding. Allow /, /[orgSlug]/*, /sign-in, /sign-up.
 - app/(auth)/sign-in/[[...sign-in]]/page.tsx
 - app/(auth)/sign-up/[[...sign-up]]/page.tsx
 - lib/authz.ts — requireRole(minRole) helper using auth() + orgRole check

 Modified files:
 - app/layout.tsx — wrap with <ClerkProvider>
 - components/nav-user.tsx — replace static user with <UserButton />
 - lib/actions/lottery-draw.actions.ts — add requireRole('org:admin') at top
 - lib/actions/lottery-query.actions.ts — add requireRole('org:member') at top

 Testing gate: role unit tests pass before merge.

 New env vars: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
 NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in, NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up,
 NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard/lottery

 ---
 Phase 2 — Multi-Tenancy + Email Queue

 Org model, orgId everywhere, public tenant pages, slug cache, Inngest email queue.

 New files:
 - lib/org-cache.ts — in-process LRU cache for slug → Organization lookups (TTL 5 min, max
  500 entries). Used only by public routes.
 - lib/authz.ts (already created in Phase 1) — add requireOrgId() for authenticated routes
 - lib/actions/org.actions.ts — createOrganization(), getOrganization(),
 updateOrganizationSettings()
 - scripts/migrate-add-orgid.ts — backfill script (see zero-downtime section)
 - app/(dashboard)/onboarding/page.tsx — org setup wizard: name, timezone, pickup details
 - app/(dashboard)/org/settings/page.tsx
 - app/[orgSlug]/page.tsx — public registration (slug→orgId via cache)
 - app/[orgSlug]/winners/page.tsx — public winners (slug→orgId via cache)
 - inngest/functions/send-winner-emails.ts — durable email background job
 - app/api/inngest/route.ts — Inngest serve handler

 Modified files:
 - lib/types.ts — add Organization; add orgId + registrantCount to Lottery; add orgId to
 Registrant, Ticket
 - lib/mongodb.ts — add getOrganizationsCollection()
 - lib/setup-indexes.ts — rebuild all indexes with orgId leading (run after backfill)
 - lib/date.ts — getTodayDateString(timezone: string) — remove hardcoded CANMORE_TIMEZONE
 - lib/email.ts — accept orgEmailFrom, orgEmailFromName params
 - emails/winner-ticket-email.tsx — remove hardcoded "Canmore"; accept orgName,
 pickupLocation props
 - lib/actions/lottery.actions.ts — resolve orgSlug → orgId via cache; enforce quota
 (Phase 3 adds billing check)
 - lib/actions/lottery-draw.actions.ts — requireRole('org:admin'), scope all queries by
 orgId, emit Inngest event instead of sendBulkWinnerEmails
 - lib/actions/lottery-query.actions.ts — requireRole('org:member'), scope all queries by
 orgId
 - components/registration-form.tsx — accept orgSlug prop, pass to server action

 Rollout: follow zero-downtime migration sequence (dual-write → backfill → index rebuild →
  switch reads).

 Testing gate: slug cache unit test, draw concurrency test pass.

 ---
 Phase 3 — Billing

 Stripe subscriptions. Atomic plan-limit enforcement. Webhook state machine.

 New files:
 - lib/stripe.ts — Stripe client singleton + getOrCreateStripeCustomer()
 - lib/plan-limits.ts — plan limit constants (maxRegistrantsPerDay by plan name)
 - app/(dashboard)/billing/page.tsx — current plan, usage, upgrade CTA
 - app/api/billing/create-checkout/route.ts — Stripe Checkout session
 - app/api/billing/create-portal/route.ts — Stripe Customer Portal session
 - app/api/webhooks/stripe/route.ts — webhook handler (see invariants section)

 Modified files:
 - lib/actions/lottery.actions.ts — add atomic quota check (findOneAndUpdate with $inc +
 $lt guard, bounded E11000 retry on upsert race); rollback quota on any insertOne failure
 (E11000 → "already registered" message; other errors → rethrow)
 - lib/actions/org.actions.ts — create Stripe Customer during onboarding; set 14-day trial
  (subscriptionStatus: "trialing")

 New env vars: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, price IDs per tier

 Testing gate: quota unit tests (100th ok, 101st blocked, rollback on any insert failure,
 E11000 → "already registered" not 500) + webhook idempotency test pass.

 ---
 Phase 4 — Production Polish

 Marketing landing page, analytics, check-in scanner, member management.

 New files:
 - app/page.tsx — convert to Ticket Farm marketing/landing page (pricing table, "Start
 Free Trial" CTA)
 - app/(dashboard)/analytics/page.tsx — lottery history charts (Growth+ only; gate with
 requirePlan('growth'))
 - app/(dashboard)/checkin/page.tsx — ticket check-in by ticketId (ACTIVE → CHECKED_IN)
 - app/(dashboard)/org/members/page.tsx — embed Clerk <OrganizationProfile />
 - lib/actions/analytics.actions.ts — getLotteryHistory(orgId, days) aggregation

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
 /analytics                  Lottery history (Growth+)        (Phase 4)
 /checkin                    Ticket check-in scanner          (Phase 4)
 /api/webhooks/stripe        Stripe webhook receiver          (Phase 3)
 /api/inngest                Inngest handler                  (Phase 2)
 /api/billing/create-checkout  Checkout session               (Phase 3)
 /api/billing/create-portal    Portal session                 (Phase 3)

 ---
 Critical Files (in order of modification)

 1. lib/types.ts — add Organization, orgId on all models, registrantCount on Lottery
 2. lib/authz.ts — new; requireRole() used by all admin actions
 3. lib/org-cache.ts — new; slug→orgId LRU cache for public routes
 4. lib/setup-indexes.ts — rebuild with orgId leading (run only after backfill)
 5. lib/mongodb.ts — add getOrganizationsCollection()
 6. lib/actions/lottery.actions.ts — quota check, orgId scoping, E11000 rollback
 7. lib/actions/lottery-draw.actions.ts — role guard, atomic lock, Inngest emit
 8. lib/actions/lottery-query.actions.ts — role guard, orgId scoping
 9. lib/date.ts — parameterize timezone (cascades to all callers)
 10. emails/winner-ticket-email.tsx — remove hardcoded Canmore branding
 11. middleware.ts — new; Clerk route protection

 ---
 Phase Dependencies

 Phase 0 ✅ → Phase 1 (auth + authz) → Phase 2 (multi-tenancy + Inngest) → Phase 3
 (billing) → Phase 4 (polish)

 Phase 1 ships to prod for Canmore with no data model changes.
 Phase 2 requires zero-downtime migration sequence before index rebuild.
 Phase 3 requires Phase 2 org model (Stripe customer links to Organization document).