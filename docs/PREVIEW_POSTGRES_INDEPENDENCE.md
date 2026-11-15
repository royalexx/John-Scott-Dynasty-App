# Hosted Vercel Preview — independent of PostgreSQL

This fixes the "League data unavailable" screen on pull-request previews after PostgreSQL was connected to the Vercel project.

## Root cause
Previously `app/page.tsx` and `proxy.ts` selected sample fixtures only when `DATABASE_URL` was empty. The Vercel integration now makes the same variable available to Preview as well as Production. Preview therefore attempted to read the expected league from PostgreSQL and rendered the unavailable state when no matching league was found.

## New behavior
- `VERCEL_ENV=preview`: always render the explicitly labeled, non-persistent `DashboardClient` demonstration using `initialDashboardData` with `isPreviewFixture: true`.
- Every Preview `/api/*` GET returns a deterministic read-only fixture (or 503 for unknown endpoints), even with `DATABASE_URL` configured. NHL headshot lookups continue redirecting to authentic NHL portrait files without Prisma.
- Preview rejects POST/PATCH/PUT/DELETE and mutating GETs with 403.
- `VERCEL_ENV=production` remains unchanged; missing/broken real PostgreSQL stays fail-closed and does not show sample scores or rosters.
- Match/Team/Players/League layout, player portraits, Phase 9 lineup actions and Phase 10 League filters are not redesigned.

## Verification
The read-only Playwright Preview web server now receives an intentionally unreachable, syntactically valid PostgreSQL URL. All preview tests must pass without connecting to it, including the sample-data banner, NHL portraits, blocked writes, known safe GET fixtures and unknown GET 503 behavior. The separate Production-no-database suite still asserts that production displays `LeagueUnavailable`.

This is a **UI review fixture**, not a real league. No Vercel environment variables, league records, migrations, seeds, credentials or production settings were modified. Do not use the fixture to operate a real league. Set up and verify a distinct preview/staging database before designing a live staging workflow.

Stacked review branch on draft Phase 10 PR #49; keep this PR draft until visual approval. `main` and `johnscottdynasty.live` remain untouched.
