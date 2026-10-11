# Latest Preview validation — October 3, 2026

## Candidate and outcome

- Local branch: `chore/beta-launch-readiness`.
- Candidate source: `84af0d05ae4d1363ace812d9fa3f69b89b199525`.
- Immutable Preview URL (user supplied): `https://ticket-farm-hfo06ixqk-evgeniis-projects-797be76f.vercel.app`.
- Vercel deployment ID: not supplied.
- Vercel status/environment/source (user reported): Ready / Preview / `chore/beta-launch-readiness`, commit `84af0d0`.
- Outcome: registration and quota scenarios passed according to the user’s manual-validation confirmation in this conversation. Direct agent browser access remains unavailable.

The September 30 Preview report predates this candidate. Its stable branch alias
does not establish which immutable deployment currently serves the candidate.
The October 2 automated results remain historical evidence; they were not rerun.

## Manual confirmation — recorded October 3

The user confirmed dashboard sign-in, the branch-specific `ticket_farm_preview`
setting, and completion of the requested Preview URI/user isolation check. The
user subsequently confirmed all requested registration and quota conditions had
already passed against the candidate. This is user-reported live evidence, not
a new agent-executed test run. Exact execution time, test organization/date, raw
database counts, logs and the Vercel deployment ID were not supplied.

- Passed: an already-open form was rejected after disabling registration, with
  no registration or lottery-counter change; re-enabling allowed exactly one
  new entry immediately.
- Passed: entry 101 was rejected at cap 100, admitted immediately at cap 250,
  and further admissions were rejected after restoring cap 100 while preserving
  the 101 admitted entries.

## Access evidence

- Local Vercel project metadata exists and identifies the project/team, but does
  not establish a deployed source revision or environment configuration.
- Attempting to access Google Chrome returned: “Computer Use permissions are not granted”.
- Neither `vercel` nor `gh` is installed in the current shell.
- Plugin discovery found an available Vercel connector with `installed: false`;
  a connection suggestion was presented. It has not been verified connected.

## Remaining evidence and checks

- Record the Vercel deployment ID if available; retain the immutable URL above.
- Independently confirm candidate database indexes, remaining provider settings,
  app URL and Turnstile hostname, test-mode Stripe and unset paid price IDs.
- Validate cross-organization lookup/redemption, permissions and pagination, then
  multi-batch email/recovery and signed provider webhooks as listed in the todo.

The agent made no live test submissions, settings changes, database writes,
provider sends or Production changes. User-performed tests are reported above.
No push or deployment is authorized by this task.

## Review

Only task/evidence documentation was changed. Existing todo additions were
preserved. Documentation diff review and `git diff --check` passed. Application
tests were not run because no application code changed. Browser access is
required for the approved live form workflow; a connected Vercel integration
can help identify and inspect the candidate deployment.
