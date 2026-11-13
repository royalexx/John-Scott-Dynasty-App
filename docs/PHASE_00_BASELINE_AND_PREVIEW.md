# Phase 0 — Safe Visual Baseline and Preview Verification

Date: 2026-11-13  
Status: implementation pushed for review; **do not merge until checks and preview-data isolation are reviewed**.

## Current confirmed Vercel configuration (2026-11-13)

The owner checked project-level environment variables, **Shared**, **Storage**, and **Integrations**, and found no database connection or injected credentials. Production at `johnscottdynasty.live` may therefore be rendering the app's historical static fallback rather than real persisted league data. This is an application-level finding and does not prove the presence or absence of credentials injected through an unknown external mechanism.

**Phase 0 adjustment:** This branch implements a deliberately database-free Vercel Preview display, *only when* `VERCEL_ENV=preview` and `DATABASE_URL` is missing. It renders fixture league data behind a prominent `UI PREVIEW · SAMPLE DATA · READ ONLY` banner. The Next.js `proxy.ts` intercepts preview API requests: writes and mutating GET routes (`/api/cron/*`, draft `?ensure=1`) return HTTP 403. With no `DATABASE_URL`, GET endpoints serve read-only fixtures and missing endpoints return HTTP 503 rather than querying Prisma. Player portraits continue to use existing NHL assets and headshot redirects.

This preview is **not** a persistent league. There is no database creation, import, migration or production provisioning in Phase 0. Do not assume `johnscottdynasty.live` is connected to a real database until Vercel Production `DATABASE_URL` and server-side authenticated data are verified.

**Preview verification:** `npm run test:preview` starts a no-database development server with `VERCEL_ENV=preview` and checks that the banner, fixture GETs, player portraits, and HTTP 403 barriers work. The screenshot suite remains separate and uses local fixtures.

## Deployment facts and boundaries

- The owner confirmed that **https://johnscottdynasty.live** is the working production domain.
- Existing GitHub PR commits have a successful **Vercel** deployment status, including the roadmap PR #9. This confirms GitHub–Vercel deployment integration, **not** that Preview and Production have separate database credentials.
- Preview `DATABASE_URL` / Neon branch isolation is **not verified**. The project currently reports no configured database connection; the new read-only preview mode is active when no `DATABASE_URL` exists.
- Until verified, **treat hosted Vercel preview URLs as potentially attached to the live league**. Open them only to inspect read-only pages; do not submit trades, waiver claims, picks, roster moves, or commissioner changes.
- No external preview domain is hard-coded or invented. Use the actual Vercel link attached to the PR deployment status.
- Existing draft PR #8 contains local Prisma seed repairs but has not been merged. The normal local database seed path on `main` should not be considered fixed.

### Required verification before interactive preview approval

In Vercel project **john-scott-dynasty**, check Settings > Environment Variables:

1. Preview must use its **own disposable PostgreSQL/Neon database branch**, not the Production `DATABASE_URL`. Confirm this without copying secret values into comments.
2. Preview authentication settings must not accidentally expose production accounts or cookies. The demo fixtures below do not bypass production authentication.
3. Preview cron/sync functionality and all write-capable endpoints must be assessed before anyone performs state-changing actions there. Do not manually invoke `/api/cron/sync` or `/api/cron/waivers` on a preview with unknown DB isolation.
4. Confirm a PR deploy URL works on a test device (320–430px layouts and one wider desktop shell), and attach it to the phase PR for visual review.

Do **not** mark this gate complete merely because GitHub shows a successful Vercel status.

## Read-only, database-free screenshot baseline

`npm run test:visual` runs `playwright.visual.config.ts`, which launches Next.js on `http://localhost:3100`.

- `UI_VISUAL_FIXTURES=1` is enabled **only in local development**. Production and Vercel builds cannot activate it.
- `app/page.tsx` renders the repository's existing static `initialDashboardData` when the fixture flag is active. This mode does not query Prisma during page rendering.
- `app/ui-visual-baseline/page.tsx` provides a **development-only** PIN login screen with harmless fixture accounts. It returns 404 outside the local visual-fixture mode.
- `visual/baseline.spec.ts` mocks browser requests to all ordinary `/api/**` endpoints; it denies every non-GET request with 403. NHL headshot redirects are allowed so portraits can use real NHL source images. No scores, managers or accounts are fetched from the live league.
- The visual runner intentionally does not use the full Playwright `e2e/` suite or a live database.
- Screenshots capture Match, Team, Players and League at 320, 375, 390, and 430px; the 1280px centered shell; player-detail, settings, chat and PIN views. Layout measurements are attached in JSON. Images are reviewed for preserved player headshots.
- These pictures are **fixture baselines**, not proof that the authenticated live deployment visually matches exactly; actual database screens require a separately authorized, isolated preview environment.

### Local commands

```bash
npm ci
npx playwright install chromium
npm run test:visual
```

The CI workflow `.github/workflows/ui-visual-baseline.yml` runs this read-only screenshot capture on relevant pull requests and uploads the resulting `test-results/visual/` and `playwright-visual-report/` as GitHub Actions artifacts.

After the action completes, open the PR > Checks > UI visual baseline > Artifacts and inspect the uploaded screenshot/report bundle. A branch push by itself is not a visual screenshot.

## Integration E2E safety gate

**Why:** The pre-existing E2E suite contains real writes: `e2e/04-api-endpoints.spec.ts` requests `/api/cron/sync`; `e2e/05-audit-regressions.spec.ts` sends roster moves; and `e2e/08-weekly-lock-and-week-sync.spec.ts` patches league settings. Undo-in-finally is not sufficient protection on a production database.

The default `playwright.config.ts` now invokes `assertIsolatedE2EDatabase` before a browser is launched. It fails closed unless:

- `E2E_ALLOW_MUTATION=1` is explicitly provided;
- `DATABASE_URL` is a valid `postgres://` or `postgresql://` URL;
- the database host is `localhost`, `127.0.0.1` or `::1`;
- the database name ends in `_e2e` or `_test` (optional additional suffix);
- the run is not in a Vercel deployment.

It also uses `reuseExistingServer: false`, preventing Playwright from attaching to an unrelated locally running app backed by the production Neon database.

Example **only after creating/seeding a disposable local test database**:

```bash
DATABASE_URL=postgresql://testuser:testpass@127.0.0.1:5432/johnscott_e2e E2E_ALLOW_MUTATION=1 npm run test:e2e
```

Never set `E2E_ALLOW_MUTATION` when targeting a shared or production database. Do not rely on a local port alone to confirm a safe test environment. The separate local seed fix from PR #8 remains a prerequisite for reliable full-suite fixtures.

## Evidence to collect for approval

- [ ] GitHub Actions `UI visual baseline` job completed and screenshots are inspectable (record failures if not).
- [ ] Baseline screenshots reviewed at 320/375/390/430 and 1280px.
- [ ] Player portrait image sources and fallback behavior reviewed; no images removed.
- [ ] Normal E2E suite refuses execution with no opt-in, a remote DB URL, or a non-test database name.
- [ ] Local seeded isolated PostgreSQL database available for integration tests.
- [ ] Vercel Preview deployment status exists; actual preview URL verified.
- [ ] **Preview DB is proven separate from production** before interactive preview testing.
- [ ] No production data or rules changed; `main` unchanged.
- [ ] PR reviewed and explicitly approved before merge.

## Unresolved prerequisites

- The GitHub connector cannot inspect Vercel Environment Variable values or the associated Neon branch. Preview isolation must be confirmed in the hosting console.
- The full mutation-capable test suite has **not** been executed as part of this phase; its original seed prerequisite is tracked by draft PR #8.
- Current baseline screenshots are produced by CI after the PR is opened. An artifact is not available until the workflow completes successfully.

## Future phases

Once Phase 0 is approved and the safety gates are met, proceed with Phase 1 (interaction correctness), then Phase 2 (design tokens), then the screen-level modernization phases. Every subsequent phase uses a separate PR and keeps all existing NHL player portraits.
