# Critical dependency remediation — September 13, 2026

The P0 dependency work from the [production-readiness audit](production-readiness-2026-09-13.md) is implemented locally. Deployment is still required for production to receive these fixes. The other application findings in that audit remain open.

## Changes

- Updated `@clerk/nextjs` from 6.37.3 to 6.39.6, resolving `@clerk/shared` 3.47.8. This addresses the affected route matcher described in [Clerk's security advisory](https://github.com/clerk/javascript/security/advisories/GHSA-vqx2-fgx2-5wq9) and removes the Clerk advisory matches reported by the production scan.
- Updated Next.js and its ESLint configuration from 16.2.6 to 16.3.5. The resolved production tree no longer reports the Next.js advisories found in the initial audit.
- Raised Inngest's minimum version to 3.54.2 and refreshed its OpenTelemetry/protobuf dependency chain within the parents' declared version ranges. No forced cross-major overrides were added.
- Refreshed the affected compatible Lodash, Babel, Browserslist, and browser-mapping transitive dependencies.
- Moved the `react-email` preview CLI to development dependencies. Runtime email components and rendering dependencies remain installed for production. This reclassification does not fix vulnerabilities in development-only preview tooling; do not expose the preview server publicly.
- Replaced the mocked route matcher in middleware tests with Clerk's real matcher. Added six checks covering encoded protected routes and repeated slashes while continuing to mock authentication.
- Added `pnpm audit:production`, which fails on high/critical production advisories. Moderate findings remain visible in its output. This script is available for a future enforced CI gate; no CI configuration was added.

## Verification

| Check | Result |
| --- | --- |
| Production advisory scan | Reduced from 87 findings to 1 moderate; zero critical/high/low findings |
| Tests | 20 files, 106 tests passed |
| Lint | Passed |
| Production build | Passed with Next.js 16.3.5; includes TypeScript checking |

The remaining production advisory is `uuid` 10.0.0 through `resend > svix`, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). It concerns a missing buffer-bounds check in certain UUID methods when an output buffer is supplied. The scan establishes package presence, not an exploitable application path. It was not suppressed or forced across a major-version boundary as part of this critical-dependency fix.

These checks validate local compilation, regression tests, and the resolved dependency tree. They do not replace an authenticated staging walkthrough, production deployment, or verification of live provider configuration. Restart any existing development process so it loads the updated framework/SDK versions.
