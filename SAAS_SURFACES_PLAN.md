# Ticket Farm SaaS Surface Realignment

## Starting state (for next session)

- Branch: `saas-one` (work continues here; do not branch off `main` — recent SaaS infra commits are not yet merged).
- Working tree: clean except for `REVIEW.md` and this `SAAS_SURFACES_PLAN.md`, both untracked.
- Tests: run with `pnpm test` (Vitest). Existing suites under `tests/` are green at the start of this work.
- No DB migrations required. Schemas are append-only (new query-layer types in `lib/types.ts`).
- Env: add `PLATFORM_ADMIN_USER_IDS` to `.env.local` before testing `/platform/*` locally.

## Suggested execution order

Each step is independently shippable and testable, in this order:

1. `requirePlatformAdmin()` + env var + unit tests (no UI yet).
2. `/platform/*` layout + `/platform/orgs` page + `listOrgDirectory()`.
3. Marketing page at `/` (swap `app/page.tsx`).
4. `ParticipantSummary` / `ParticipantHistoryEntry` types + query helpers.
5. `/dashboard/participants` UI.
6. Middleware test additions last (after all routes exist).

## Decisions already made

These were resolved with the user before writing this plan — do not re-litigate:

- **Allowlist mechanism:** `PLATFORM_ADMIN_USER_IDS` (Clerk user IDs), not emails. Reason: stable across email changes; matches how Clerk identifies users in the rest of the codebase.
- **Email grouping:** Keep current `trim + lowercase` (no plus-stripping, no Gmail dot collapse). Reason: matches existing storage at `lib/actions/lottery.actions.ts:98`; aggressive normalization surprises users.
- **Platform dashboard scope:** Strict view-only. Reason: smallest blast radius for v1; no audit-log infrastructure needed yet.
- **Marketing `/`:** Minimal hero + CTA (one screen). Reason: ship the surface, iterate on copy later.

## Known route-group quirk

The org dashboard is split between two Next.js segments:

- `app/dashboard/lottery/page.tsx` (no route group)
- `app/(dashboard)/onboarding/page.tsx`, `app/(dashboard)/billing/page.tsx` (inside `(dashboard)` group)

Add the new participants page under `app/dashboard/participants/page.tsx` to match the `lottery` sibling — do **not** put it inside `(dashboard)`. Standardizing the two locations is out of scope for this pass.

## Context

Ticket Farm currently lacks a public marketing surface (the root `/` only redirects to sign-in or dashboard) and has no platform-owner view across all tenants. The codebase is already multi-tenant with strong org scoping (recent IDOR fix on `saas-one`), durable email outbox, and a working self-serve onboarding flow, so the missing pieces are surface-level rather than infrastructural.

This change realigns the app into three explicit surfaces — public marketing, org dashboard, platform-owner dashboard — and adds a per-org participant-history view. It does not change the lottery mechanics or data model: tickets remain winner-only, and participants stay a query-layer concept rather than a new collection.

## Three Surfaces

| Surface | Route | Audience | Auth |
| --- | --- | --- | --- |
| Public marketing | `/` | Anyone | None |
| Public org pages | `/{orgSlug}`, `/{orgSlug}/winners` | Anyone (unchanged) | None |
| Org dashboard | `/dashboard/*` | Org members/admins | Clerk auth + active org |
| Platform dashboard | `/platform/*` | Ticket Farm staff | Clerk auth + `PLATFORM_ADMIN_USER_IDS` allowlist |

## Implementation

### 1. Public marketing page at `/`

Replace `app/page.tsx` (currently a 10-line redirect chain) with a minimal hero + CTA component.

- Signed-out: render hero (product name, one-line value prop), primary CTA → `/sign-up`, secondary link → `/about`.
- Signed-in with org: redirect to `/dashboard/lottery` (preserves the current authed UX).
- Signed-in without org: redirect to `/onboarding` (preserves current logic at `app/page.tsx:8`).

No middleware change needed — `/` is not in `isProtectedRoute`. Auth check stays in the page component.

### 2. Platform-admin authorization

Add to `lib/authz.ts` next to `requireRole`:

```ts
export async function requirePlatformAdmin(): Promise<{ userId: string }>
```

Behavior:
- Reads `PLATFORM_ADMIN_USER_IDS` env var (comma-separated Clerk user IDs).
- Calls `auth()`, throws `"Unauthorized: not authenticated"` if no `userId`.
- Throws `"Forbidden: platform admin required"` if `userId` not in the allowlist.
- Does **not** require `orgId` — platform admins operate outside any tenant.

Add `PLATFORM_ADMIN_USER_IDS` to `.env.example` with a short comment.

### 3. `/platform/*` routes (view-only)

Create `app/platform/layout.tsx` that calls `requirePlatformAdmin()` server-side; any failure renders a 404-like "not found" page to avoid leaking that the route exists.

Add `/platform/(.*)` to `isProtectedRoute` in `middleware.ts` so unauthenticated users are bounced by Clerk before the layout runs. Do **not** add it to `isOrgRequiredRoute` (platform admins have no org).

Pages in v1 (strict view-only — no mutating controls):

- `app/platform/page.tsx` — redirects to `/platform/orgs`.
- `app/platform/orgs/page.tsx` — org directory table. Columns: name, slug, public page URL, `publicPageEnabled`, plan, status, created date, today's registrants, total registrants, total tickets, last activity timestamp.

Add a new server-action file `lib/actions/platform.actions.ts` with `listOrgDirectory()`:

- Calls `requirePlatformAdmin()` at entry.
- Queries `organizations` collection unscoped, then aggregates per-org counts from `registrants` and `tickets` (use a single `$facet` or per-org grouped queries — start with grouped queries for clarity; optimize only if slow).
- Returns a typed array; no DB writes anywhere in this file.

### 4. `/dashboard/participants` (new org-dashboard page)

Add `app/dashboard/participants/page.tsx`. Standard org-scoped server component using `requireRole("org:member")`.

Add query helpers (no new collection) in `lib/actions/participants.actions.ts`:

- `listOrgParticipants(opts: { search?: string; limit: number; cursor?: string })` → returns `ParticipantSummary[]`.
- `getParticipantHistory(email: string)` → returns `ParticipantHistoryEntry[]` for the active org only.

Both helpers:
- Start with `const { orgId } = await requireRole("org:member")` and include `{ orgId }` in every Mongo filter (matches the cross-tenant pattern enforced after commit `e3c9caf`).
- Group by the already-stored normalized email (current behavior at `lib/actions/lottery.actions.ts:98` — trim + lowercase). No new normalization helper.
- Use the existing `{ orgId, email, date }` compound index on `registrants` (defined in `lib/setup-indexes.ts`).

Types added to `lib/types.ts`:

```ts
export type ParticipantSummary = {
  orgId: string;
  email: string;
  latestName: string;
  firstEnteredAt: Date;
  lastEnteredAt: Date;
  entryCount: number;
  winCount: number;
  activeTicketCount: number;
  checkedInTicketCount: number;
};

export type ParticipantHistoryEntry = {
  date: string;
  enteredAt: Date;
  won: boolean;
  ticketNumber?: number;
  ticketId?: string;
  ticketStatus?: "ACTIVE" | "CANCELED" | "CHECKED_IN";
  emailSent?: boolean;
  emailError?: string;
};
```

### 5. Onboarding flow — no change

The current flow at `app/(dashboard)/onboarding/page.tsx` and `lib/actions/org.actions.ts:17` already:
- Renders Clerk's `CreateOrganization` when `orgId` is missing.
- Renders `OnboardingForm` when the Mongo org doc is missing.
- Sets `publicPageEnabled: true` on org creation.
- Redirects to `/dashboard/lottery` afterward.

This matches the plan's "preserve self-serve onboarding" requirement; no edits needed.

## Critical files to modify

- `app/page.tsx` — replace redirect with marketing page (signed-in fallback redirects preserved).
- `middleware.ts` — add `/platform(.*)` to `isProtectedRoute` only (not `isOrgRequiredRoute`).
- `lib/authz.ts` — add `requirePlatformAdmin()`.
- `lib/types.ts` — add `ParticipantSummary`, `ParticipantHistoryEntry`.
- `.env.example` — add `PLATFORM_ADMIN_USER_IDS`.

## Critical files to create

- `app/platform/layout.tsx`
- `app/platform/page.tsx`
- `app/platform/orgs/page.tsx`
- `app/dashboard/participants/page.tsx`
- `lib/actions/platform.actions.ts`
- `lib/actions/participants.actions.ts`

## Explicitly out of scope (deferred)

- Materialized `participants` collection — query-layer is fine until proven slow.
- Plus-addressing or Gmail-dot normalization — keep current trim+lowercase grouping.
- Platform-side moderation actions (disable org, toggle `publicPageEnabled`, force-cancel) — view-only in v1.
- Billing UI redesign — current `/billing` page stays as-is.
- Phone number on participant records.
- `LotteryHistorySummary` view — types can be added when a UI consumer needs them; not building the UI in this pass.

## How to resume in a fresh session

1. Open Claude Code from this directory: `cd /Users/evgeniikozhushko/Documents/Code/Projects/ticket-farm` first — file paths below are relative to it.
2. Confirm starting state hasn't drifted: `git status` and `git log --oneline -5`. Expect to still be on `saas-one`.
3. Kick off step 1 with a single constrained prompt — for example:
   > "Read SAAS_SURFACES_PLAN.md and implement step 1 (`requirePlatformAdmin` + env var + unit tests). Don't go beyond step 1."

   The "don't go beyond step 1" matters: the plan is broken into 6 independently shippable steps so each can be reviewed and committed before moving on. Without that constraint a fresh session will tend to plow through several at once.
4. Do not re-enter plan mode — the plan is settled. If a session offers to re-plan, point it at this file instead.
5. After each step lands and you've committed, prompt the next one explicitly, e.g. "Now do step 2 (`/platform/*` layout + orgs page + `listOrgDirectory`)."
6. Run `pnpm test` after every step. New tests for each step are listed under **Verification** below.

## Verification

### Tests to add (Vitest, alongside existing `tests/*.test.ts`)

- `tests/platform-authz.test.ts`
  - `requirePlatformAdmin()` throws when unauthenticated.
  - Throws when `userId` is not in `PLATFORM_ADMIN_USER_IDS`.
  - Resolves when `userId` is in the allowlist, even without `orgId`.
- `tests/middleware.test.ts` (extend existing)
  - `/` is reachable signed-out.
  - `/{orgSlug}` is reachable signed-out (regression check).
  - `/dashboard/*` redirects to `/onboarding` when authed without org.
  - `/platform/*` requires auth; layout returns not-found for non-allowlisted users.
- `tests/participants.test.ts`
  - History grouped by lowercased email matches across multiple dates.
  - All queries include `orgId` filter (tripwire: assert a registrant from another org never appears).
  - Win/ticket counts reflect only winner-issued tickets.
- `tests/platform-orgs.test.ts`
  - Non-allowlisted authed user is denied.
  - Allowlisted admin sees orgs they don't belong to.
  - Returned counts are not filtered to the admin's active Clerk org.

### Manual verification

1. Run `pnpm dev` (or repo's dev script) and open `/` signed-out — confirm marketing hero renders, CTA links to `/sign-up`.
2. Sign in as a user with an org, hit `/` — should land on `/dashboard/lottery`.
3. Sign in as a user without an org, hit `/` — should land on `/onboarding`.
4. With `PLATFORM_ADMIN_USER_IDS` unset, hit `/platform/orgs` while signed in — should not-found.
5. Set `PLATFORM_ADMIN_USER_IDS=<your_clerk_user_id>` in `.env.local`, restart, hit `/platform/orgs` — directory renders with all orgs and counts.
6. As an org member, visit `/dashboard/participants` — see participants from your org only; click a row to see history.
7. Run `pnpm test` — all suites green.
