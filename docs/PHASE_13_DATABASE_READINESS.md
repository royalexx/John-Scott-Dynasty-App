# Phase 13 — PostgreSQL, league records and manager PIN readiness

**Baseline:** draft Phase 12 PR #52, `ui/phase-12-performance` at SHA `796649886e1013c993cc932cb9ee10674bb78592`. The rejected Phase 11 matchup redesign is **not** an ancestor. The approved pre-Phase-11 Match/Team/Players/League layout is unchanged.

## Verified Vercel configuration (metadata only)

Inspection on November 14, 2026 found:
- `DATABASE_URL`, `DATABASE_URL_POOLED`, `DATABASE_PRISMA_DATABASE_URL` and `DATABASE_POSTGRES_URL` are all sensitive integration-managed variables scoped to **both** `preview` and `production`. There is no evidence of separate physical databases; treat Preview and Production as potentially sharing the same database.
- `CRON_SECRET` and `SESSION_SECRET` also exist in Preview and Production. Their values were **not** fetched, printed or modified.
- The current production deployment has commit `9724aaa1b960f157c771cd8688a8282c5e67c543`, predating the staged UI/backend release. Recent production function logs show `Environment variable not found: DATABASE_URL` from that deployment. Environment changes do not automatically rebuild an older deployment. This does **not** establish whether the configured Postgres database is empty.
- The approved Vercel preview remains database-independent, explicitly labeled `SAMPLE DATA · READ ONLY`, and rejects mutations. Its existence is not a production database readiness test.

**Blocking rule:** Do not run schema mutations, migrations, seeds, sample PINs, test wagers, roster moves or login tests against the hosted connection until an independent staging database is configured and verified. Do not run `prisma db push`, `migrate reset`, or `prisma:seed` on production.

## Read-only league readiness doctor

`npm run league:readiness` connects only to the supplied `DATABASE_URL` and performs SELECTs. It:
1. Detects missing schema tables, absent migration history, pending or incomplete migration entries, and the deprecated PIN column default.
2. Checks for the canonical league ID `00000000-0000-0000-0000-000000000001` expected by `app/page.tsx`, exactly 12 canonical teams, unique managers, and one commissioner.
3. Checks the persisted 24-week / 144-game matchup schedule against the existing Match tab fixtures. It does not fabricate historic scores or rosters.
4. Counts database players and roster slots; checks for cross-league roster references.
5. Verifies that stored manager PINs are salted hashes and that the disposable fixture PIN `1234` and `@example.com` manager addresses have been replaced. It only outputs aggregate counts, never identities, PINs, hashes or credentials.
6. Returns a machine-readable verdict: `READY`, `SCHEMA_NOT_READY`, `MIGRATIONS_REQUIRE_REVIEW`, `LEAGUE_NOT_INITIALIZED`, or `LEAGUE_REQUIRES_REVIEW`. Non-ready exits with status 1.

The verdict covers **structural readiness and manager onboarding only**. A game-stat feed and legitimate user operations must be validated separately. `scripts/migration-preflight.mjs` remains available for detailed **read-only** migration inventory on an older populated database.

## Staging-only real league initialization

`npm run league:bootstrap` is **validation-only by default** and reads a JSON object of 12 manager records from **standard input**, not a file or command-line option. Each record has `teamName`, `managerName`, `handle`, `email`, `pin` and `isCommissioner`. To be valid:
- The twelve team names must exactly match the canonical NHL fantasy league team names already used in the current Match UI. No team names are invented or renamed by this script.
- Each manager must have an independent 4-digit PIN different from the fixture PIN `1234`. One and only one commissioner must be present; handles, emails, teams and PINs must be unique.
- The command prints only non-sensitive summary information; input PINs never enter logs, artifacts or local files.

`npm run league:bootstrap -- --apply` is the only mutating mode. It refuses to run in production and requires:
- `LEAGUE_BOOTSTRAP_TARGET=staging`
- `LEAGUE_BOOTSTRAP_CONFIRM=INITIALIZE_EMPTY_STAGING_LEAGUE`
- A verified database hostname. Loopback is allowed only for disposable CI; remote staging requires `LEAGUE_BOOTSTRAP_APPROVED_HOST` to match the independently verified hostname.
- Zero existing managers and league-related records. All changes happen in one database transaction, under an advisory lock. A second invocation fails without resetting any identity, lineup, PIN, FAAB, matchup or draft pick.

On successful staging-only initialization it inserts a single league, 12 managers with salted scrypt PIN hashes, 12 teams, 144 fixtures, 180 tradable future draft picks and the NHL player registry. It creates **no** arbitrary current roster assignments or fabricated historical lineups. The real roster should be drafted or imported through a separately reviewed workflow, not copied from overlapping demo data.

The script does **not** modify Vercel environment variables, create staging infrastructure, or run against the currently attached production database.

## CI proof and persistence

The new `phase13-readiness-smoke` job provisions a **throwaway PostgreSQL 16** service at `127.0.0.1` with a database name containing `phase13`, and runs:
1. Apply the five existing migrations to that new, isolated database.
2. Verify that an empty migrated DB is reported as not initialized.
3. Verify read-only/default bootstrap, invalid PIN rejection and missing approval refusal.
4. Run the explicitly authorized staging-mode initialization.
5. Independently read the data through Prisma, verify manager PIN hashes and one commissioner, disconnect, reconnect, rotate a PIN in the throwaway database, and verify the old PIN stops working.
6. Verify repeat initialization is refused, all records persist and the readiness doctor returns `READY`.

The existing CI jobs remain: TypeScript/build, database-backed E2E, legacy additive migration rehearsal, read-only UI preview and production-without-db fail-closed safety. No hosted database credentials are injected into any CI workflow.

## Remaining go-live gates (not yet complete)

1. Establish an isolated **staging database**, separately from the Vercel Production database. Confirm identities with non-secret server-side metadata, not by guessing from integration variable names.
2. Run `scripts/migration-preflight.mjs` and `league:readiness` read-only on the production database **from an approved protected execution environment**. Record only the sanitized verdict and migration state. If an existing legacy database is populated, follow the reviewed additive migration process; never treat an already populated database as an empty seed target.
3. Collect the actual 12 manager names/handles/emails/PINs securely. Initialize only an **empty staging database** with the one-time bootstrap; do not use default shared PINs for friends.
4. Confirm role-scoped manager login, PIN change and browser session invalidation, roster and draft persistence, and game sync in that independent staging environment.
5. Obtain a separate approval for any real production initialization or schema migration, and then promote the fully reviewed integration build to `johnscottdynasty.live`. The currently deployed production build predates the PostgreSQL environment binding and must be replaced as part of the eventual release.

**Do not merge PRs or deploy to the production domain automatically in this phase.** The user can review the draft PR and database-free preview without touching live records.
