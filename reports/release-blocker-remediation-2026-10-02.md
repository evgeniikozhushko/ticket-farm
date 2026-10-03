# Free-beta blocker remediation

Date: October 2, 2026 (America/Edmonton).
Baseline: `b9b9b49ed6d40203f07081cb64075f981598711f` on
`chore/beta-launch-readiness`, plus the uncommitted changes described below.

This report updates the [September 30 audit](production-release-audit-2026-09-30.md).
The automated application gates pass. **Production sign-off remains pending the
external gates below.** `main` automatically deploys Production; no merge, commit,
push, branch creation, deployment, or Production database change was performed.

## Resolved application work

| Finding | Result and evidence |
| --- | --- |
| R1: vulnerable production dependencies | Next.js and eslint-config-next are aligned at 16.3.6; Resend is 6.32.0; compatible transitive updates resolve brace-expansion to 2.1.7 and @grpc/grpc-js to 1.14.5. Production audit reports no known vulnerabilities, without overrides or suppression. Frozen-lockfile install passed. |
| R2: blocked later email batches | Traversal checkpoints each batch's outcome, attempts every page before retrying failed batches, preserves failed-step retries, and checks current pending/sending/failed/uncertain recipient counts before completion. Real MongoDB regression covers 11 recipients, early uncertainty, persistent and transient failures, actual recovery and the manual-retry action. Accepted recipients are not resent; uncertain recipients are not sent. |
| R3: delivery projection races | Webhook and worker use one projection helper with atomic rank/time filters for winner tickets and non-winner registrations. Earlier writers cannot replace higher-rank or newer outcomes; repeated writes remain available to repair downstream failures. Existing delivery values are respected even without new ordering metadata. Real MongoDB tests pause an older webhook and a worker while a bounce completes; both recipient kinds retain the bounce. Equal-rank provider timestamps and webhook replay repair are covered. |
| R4: reproducible integration verification | Added `test:release`, `check:release`, the local replica-set preflight, and `RELEASE_CHECKS.md`. A disposable localhost MongoDB 8.2.12 replica set ran all suites. No integration suites were skipped. Missing URI and unavailable-database paths fail before the test suite. Remote branch protection and the eventual committed release revision remain to be verified. |

R7's implementation work also removes recipient addresses/provider error bodies from
routine winner-send logs, documents shutdown/deletion across durable and legacy job
payloads, and aligns the privacy notice with the attended data-request procedure.
The live shutdown/deletion demonstration remains pending.

The shared projection helper adds optional ordering fields to existing ticket and
registrant documents. No schema/index migration is needed; old records are handled by
the delivery-state fallback. Previously incorrect projections require normal
webhook replay or worker synchronization to repair; no historical Production data
was rewritten.

## Verification

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Passed; no lockfile resolution changes required |
| Focused worker/webhook/signature checks | 15 tests passed; real Resend SDK accepts a synthetic existing Svix signature and rejects altered payloads |
| Focused real MongoDB email tests | 14 passed, including manual retry, recovery and controlled concurrency |
| `pnpm test:release` with no integration URI | Correctly failed before running tests |
| Release preflight under restricted localhost access | Correctly failed with the unavailable-replica-set message; full release check then ran outside that restriction |
| `TICKET_FARM_TEST_MONGODB_URI=<disposable-local-replica-set> pnpm check:release` | Passed: lint, types, 36 test files / 255 tests / no skips, no known production vulnerabilities, and production build |
| Registration DB regressions | Disabled admissions leave counts unchanged; re-enabling succeeds immediately. At 100 entries cap 100 rejects, cap 250 admits entry 101 immediately, restored cap 100 rejects further admissions and preserves all 101 entries. |
| Diff review | Application, dependency, test and documentation diff reviewed; `git diff --check` passed |

The build uses `.env.local`; it is a production-mode build, not evidence that Vercel
Production variables are correct. Integration suites use random local databases and
drop only those databases afterward. External email sends are mocked in DB tests.

The verified implementation manifest covers the 15 changed application, dependency,
script and test files (including the new status helper and signature test), with
SHA-256 `32e84a0444b45d7677b311d0a696bf3e7333bd9aacae1a2d52346f2c71206fa0`.
It hashes sorted relative paths followed by a NUL, file bytes, and a NUL. Documentation
is excluded. This identifies the checked working tree; it is not a release commit.
Record the final committed revision and rerun gates if its implementation changes.

## Remaining external gates

Computer Use reported that permissions were not granted; no connected browser tabs
or installed Vercel/GitHub CLI were available. External checks were not executed and
have not been marked passed.

- [ ] R5: identify the immutable candidate Preview deployment/source and repeat the
  required live registration, quota, isolation, permission, pagination, multi-batch
  delivery, signed delivery/bounce/failure and test-mode Stripe scenarios.
- [ ] R5: inspect actual Production database/indexes, Clerk, Turnstile, Inngest,
  Resend API/webhook secret, application URL, platform-admin allowlist and test-mode
  Stripe. Recheck the previously missing Production Resend webhook secret. Keep paid
  price IDs unset. Verify remote release protection.
- [ ] R6: designate primary/backup operators and attended pilot hours; verify Atlas
  backups/retention, agree recovery targets, execute an isolated restore, record a
  compatible rollback target, and measure candidate Preview capacity for 100/250
  entries and simultaneous organizations. See `BETA_OPERATIONS.md`.
- [ ] R7: execute a synthetic organization shutdown and participant deletion drill
  in isolated Preview, including provider job cancellation, privacy-request
  verification, retained backup/provider treatment, and unrelated-org preservation.
- [ ] After release authorization: deploy the verified source and perform Production
  smoke/log checks, then remove temporary QA access without breaking protected
  Preview webhook integrations.

R8 remains deferred for paid release; no Stripe concurrency change or paid lifecycle
sign-off is claimed. Free-beta readiness requires the remaining R5–R7 evidence or an
explicit, narrowly scoped operational acceptance from the owner.
