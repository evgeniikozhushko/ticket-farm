# Ticket Farm Product Roadmap

This document records the next major product capabilities planned after the
private-beta readiness work. These features are not currently available and
must not be presented as implemented in public copy until their acceptance
criteria are complete.

## Recommended build order

1. Ticket cancellation
2. Scheduled draws
3. QR-code pickup
4. Real analytics

## 1. Ticket cancellation

Allow an authorized organization admin to cancel an active ticket from the
dashboard.

Acceptance criteria:

- Cancellation is organization-scoped and requires an admin role.
- Only an active ticket can transition to `CANCELED`; checked-in tickets cannot
  be canceled.
- Cancellation and participant-summary counters update atomically.
- A canceled ticket cannot be redeemed or checked in.
- The dashboard clearly distinguishes active, checked-in, and canceled tickets.
- The action records the actor, organization, ticket, timestamp, and transition
  in the application audit trail.
- Concurrent cancellation and redemption resolve to one valid final state.

## 2. Scheduled draws

Allow an organization admin to configure when a daily draw should run in the
organization's timezone, while retaining the existing manual draw as an
operator fallback.

Acceptance criteria:

- Schedule configuration is admin-only, validated, and timezone-aware.
- A scheduled invocation uses the existing transactional draw boundary and is
  idempotent for one organization and lottery date.
- Concurrent manual and scheduled attempts produce exactly one draw.
- Missed, failed, and delayed runs are visible to operators and recoverable
  without creating new tickets or duplicate notifications.
- Disabling a schedule prevents future automatic draws without changing an
  already completed draw.
- Public copy describes draws as scheduled only after the production scheduler
  and monitoring are verified.

## 3. QR-code pickup

Add a scannable representation of the existing private ticket Reference to the
winner email and pickup workflow.

Acceptance criteria:

- The QR code encodes only the unpredictable private Reference or a secure URL;
  it contains no name, email, sequential ticket number, or other personal data.
- Scanning uses the existing organization-scoped lookup and one-time redemption
  rules.
- Duplicate scans report that the ticket was already redeemed and preserve the
  original check-in timestamp.
- Canceled and cross-organization tickets cannot be redeemed.
- Staff can still enter the Reference manually when scanning is unavailable.
- Email and mobile pickup views are tested with representative camera/scanner
  devices before the feature is advertised.

## 4. Real analytics

Replace placeholder analytics and the inactive navigation entry with bounded,
organization-scoped metrics derived from real application data.

Acceptance criteria:

- Metrics use authoritative organization-scoped data and the organization's
  timezone for daily boundaries.
- Initial metrics cover registrations, draw participation, winners, pickup
  completion, cancellations, and notification outcomes.
- Queries are indexed, paginated or time-bounded, and tested with realistic
  historical volumes.
- Empty and unavailable states are distinguishable; database failures do not
  render as valid zero activity.
- Access follows the documented organization role and plan policy.
- The sidebar links to a functional route only after the real-data dashboard is
  ready; no placeholder charts are presented as production analytics.

## Release rule

Update public marketing, README, and plan descriptions only after the relevant
feature meets its acceptance criteria and passes a controlled preview smoke
test. Until then, describe the current workflow as manual randomized draws,
automatic email delivery after a draw, private Reference-based pickup, and
operational dashboard reporting.
