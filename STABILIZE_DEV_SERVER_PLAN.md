# Stabilize Local Dev Server — Review of Proposed Solution

## Context

Local `pnpm dev` is throwing:

```
Cannot find module '../chunks/ssr/[turbopack]_runtime.js'
```

after Turbopack first renders `/`, then fails to reopen its on-disk cache
(`Unable to open static sorted file ... .sst`) and never regenerates the runtime
chunk. Repeatedly deleting `.next` fixes it for a single boot but the same
corruption returns. The proposed fix is to drop the experimental Turbopack
dev cache and run dev under Webpack instead.

## Verdict: the proposed solution is sound, with one small refinement

### What the solution gets right

- **`experimental.turbopackFileSystemCacheForDev: true` is exactly the source of the `.sst` file.**
  That option is what enables Turbopack's persistent on-disk dev cache; the
  `.sst` ("static sorted") files in the error are the artifact of that cache.
  Disabling it is the correct root-cause fix for the cache-corruption half of
  the failure.
- **The `--webpack` flag is the correct opt-out for Next 16.**
  In Next 16, Turbopack is the default for `next dev`. The documented escape
  hatch is `next dev --webpack` (not `--no-turbo`, which was the Next 14/15
  spelling). Verified against `next@16.0.10` in `package.json`.
- **`.next` cleanup after switching bundlers is required**, since Turbopack and
  Webpack write incompatible artifacts to the same directory.
- **`reactCompiler: true` is safe to keep** under both bundlers — Next 16 wires
  the React Compiler through SWC/Babel independently of the bundler choice.
- **Production is unaffected.** `next build` / `next start` are not touched by
  the dev script change, and the removed option only applied to dev.

### One refinement worth considering

The two failures in the stack are caused by **one** thing (the experimental
dev cache), not two independent bugs. Removing
`turbopackFileSystemCacheForDev` alone may already stabilize Turbopack dev.
Two staged options:

1. **Minimal first (recommended to try first, ~30s to test):**
   Remove the experimental flag, keep `dev` as `next dev` (Turbopack), delete
   `.next`, restart. If `/` renders cleanly across a few hot reloads and a
   restart, you keep Turbopack's speed.
2. **Fallback if (1) still corrupts:**
   Do exactly what the proposed plan says — switch `dev` to
   `next dev --webpack` and keep a `dev:turbopack` escape hatch.

The proposed plan jumps straight to (2). That is the safer choice if you have
been chasing this for a while and just want it to stop; (1) is the choice if
you want to keep Turbopack's DX.

### Minor nits in the proposed write-up

- The `pnpm test` / `pnpm lint` / `pnpm exec tsc --noEmit` verification steps
  are good hygiene but do not actually exercise the dev server — they would
  have passed even while the bug was active. The real verification is the
  browser hit on `http://localhost:3000/` plus one hot-reload edit to confirm
  the runtime chunk is regenerated correctly.
- Worth pinning **why** `turbopackFileSystemCacheForDev` was enabled in the
  first place (faster cold starts after `.next` deletes). If nobody on the
  project explicitly needs it, removing it is pure win; if someone added it for
  a measured speedup, document the tradeoff before reverting.

## Recommended Plan

### Step 1 — Try the minimal fix

Edit `next.config.ts`:

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
};

export default nextConfig;
```

Then:

```bash
# stop the running pnpm dev
rm -rf .next
pnpm dev
```

Visit `http://localhost:3000/`, sign-out view should show the landing page.
Edit any file under `app/` to force a hot reload and confirm no runtime-chunk
error.

### Step 2 — If Step 1 still corrupts, switch dev to Webpack

Edit `package.json`:

```jsonc
"scripts": {
  "dev": "next dev --webpack",
  "dev:turbopack": "next dev",
  "build": "next build",
  "start": "next start",
  ...
}
```

Then `rm -rf .next && pnpm dev`. Confirm the dev server log no longer prints
the Turbopack banner and `/` renders.

### Verification (after either step)

- Browser: `http://localhost:3000/` returns 200 and shows the Ticket Farm
  landing page when signed out.
- Hot reload: edit `app/page.tsx`, save, confirm the page updates without a
  runtime-chunk error.
- Sanity: `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit` still pass.

### Files to modify

- `next.config.ts` — remove `experimental.turbopackFileSystemCacheForDev`.
- `package.json` (Step 2 only) — flip `dev` to `next dev --webpack`, add
  `dev:turbopack`.

### Rollback

Both changes are one-line reverts in tracked files; no migration, no schema,
no production surface touched.

## Resolution Note — 2026-05-29

The configured active fix is to make the default local dev server use Webpack:

```bash
pnpm dev
```

now runs:

```bash
next dev --webpack
```

This is intended to avoid the Next.js 16.2.6 Turbopack dev-server failure seen
when Clerk's `auth.protect()` synthetic rewrites target `/clerk_<id>`, which
could produce 500 responses and missing Turbopack/runtime manifest artifacts
during local development.

Turbopack remains available as an explicit retest path:

```bash
pnpm dev:turbo
```

No middleware change is required; `auth.protect()` remains the correct route
protection behavior. `reactCompiler: true` also remains enabled in
`next.config.ts`.

### Follow-up Guard

The first Webpack retest showed that Next could still boot with a partial
`.next/dev` directory after `pnpm clean`, leaving `prerender-manifest.json`
missing and causing signed-out requests to return 500. `pnpm dev` and
`pnpm dev:webpack` now run `scripts/ensure-next-dev-manifests.cjs` before
starting Next so the required dev manifests exist even after a clean.

Verification from a clean `.next` now passes:

- `pnpm dev` reports `Next.js 16.2.6 (webpack)`.
- Five signed-out requests to `/dashboard/lottery` returned `404`, never `500`.
- The dev log showed no `MODULE_NOT_FOUND`, no missing `prerender-manifest`, no
  missing `app-paths-manifest`, and no `[turbopack]_runtime.js`.
- `pnpm test tests/middleware.test.ts` passed.
