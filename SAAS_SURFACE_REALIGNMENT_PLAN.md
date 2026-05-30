# Ticket Farm SaaS Surface Realignment

## Summary

Reframe the app around three distinct surfaces:

- Public marketing homepage at `/` for anyone discovering Ticket Farm and starting org signup.
- Org dashboard at shared `/dashboard/*`, scoped to the active Clerk organization.
- Platform-owner dashboard at `/platform/*`, visible only to allowlisted Ticket Farm admins.

Keep public org ticket pages at `/{orgSlug}` and `/{orgSlug}/winners`; these remain unauthenticated and go live immediately after org setup.

Keep the current lottery flow: public users enter the lottery; tickets are generated only for winners after the org runs the draw.

## Key Changes

- Replace current `/` signed-out redirect with a public marketing/signup page.
  - Primary CTA goes to `/sign-up`.
  - Signed-in users can still be routed to `/dashboard/lottery` or `/onboarding` from auth pages.
- Preserve self-serve org onboarding.
  - Clerk signup creates the user.
  - User creates/selects a Clerk organization.
  - Ticket Farm onboarding creates the Mongo `organizations` document with `publicPageEnabled: true`.
- Add platform-owner authorization.
  - Add `requirePlatformAdmin()` using an env allowlist such as `PLATFORM_ADMIN_EMAILS` or `PLATFORM_ADMIN_USER_IDS`.
  - Add `/platform` protected by that helper, separate from Clerk org roles.
- Add `/platform/orgs` view-only org directory.
  - Show org name, slug, public page URL, public page enabled, plan/status, created date, today's registrants, total registrants, total tickets, and last activity.
  - Do not allow editing customer/org data in v1.
- Expand org dashboard information architecture.
  - Keep `/dashboard/lottery` for today's draw workflow.
  - Add `/dashboard/participants` for searchable public participant history.
  - Add `/dashboard/history` for date-based lottery history.

## Data Model / Interfaces

- Keep `Registrant`, `Lottery`, and `Ticket` as source-of-truth collections.
- Treat a public participant as an org-scoped normalized email identity.
  - No public participant login.
  - No phone number in v1.
- Add query-layer types rather than a new required collection initially.
  - `ParticipantSummary`: orgId, name/latestName, email, firstEnteredAt, lastEnteredAt, entryCount, winCount, activeTicketCount, checkedInTicketCount.
  - `ParticipantHistoryEntry`: date, enteredAt, won, ticketNumber, ticketId, ticketStatus, emailSent, emailError.
  - `LotteryHistorySummary`: date, status, registrantCount, winnerCount, drawnAt, maxTicketsAvailable.
- If query performance becomes an issue later, add a materialized `participants` collection, but do not introduce it in v1 unless needed.

## Test Plan

- Middleware/auth tests:
  - `/` is public.
  - `/{orgSlug}` remains public.
  - `/dashboard/*` requires org context.
  - `/platform/*` requires platform admin allowlist.
- Public registration tests:
  - Existing org slug with `publicPageEnabled: true` renders registration.
  - Missing or disabled org slug returns 404.
  - Registration still creates a daily `Registrant` entry and does not immediately create a `Ticket`.
- Platform dashboard tests:
  - Non-allowlisted signed-in user is denied.
  - Allowlisted admin can load org directory across all orgs.
  - Org metrics are not scoped to the active Clerk org.
- Org dashboard tests:
  - Participants page is scoped to the active org only.
  - Participant history groups by normalized email.
  - History shows entry dates, win state, ticket number/ID, ticket status, and email status.
  - Date history shows past lotteries without exposing other orgs.

## Assumptions

- Platform admin access is allowlist-based.
- Organizations are self-serve and public-facing.
- Org dashboards stay at shared `/dashboard/*` using active Clerk org context.
- Public participants are identified by email within one organization.
- "Placement number" means winner ticket number, not entry order.
- Billing is shown in dashboards but not redesigned or newly enforced in this pass.
