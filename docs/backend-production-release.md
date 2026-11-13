# Backend audit production merge gate

This checklist applies to the consolidated draft pull request **#43**. It does not authorize deployment or mutate any hosted database.

## 1. Code gate (automated)
- [ ] `static-checks`: `npm ci`, TypeScript, production Next.js build.
- [ ] `database-smoke`: fresh PostgreSQL, all migrations, isolated league seed, full Playwright suite.
- [ ] `legacy-upgrade-smoke`: populate a second disposable database using **main's pre-migration Prisma schema**, inspect it, mark the baseline, apply additive migrations, compare schema, and prove all manager/team/roster/matchup records remain unchanged.
- [ ] All checks pass on the **final release commit**. New commits invalidate earlier green CI results.

The intentionally skipped fixture-dependent tests must be disclosed during review. They are not evidence that the corresponding production data has been checked; synthetic rule/DB regression tests cover the critical cases.

## 2. Hosted database gate (manual read-only access required)
No connection string or credentials belong in code, GitHub comments, CI logs, or this file.

From a trusted environment with `DATABASE_URL` set to the **correct hosted database**, run:

```bash
node scripts/migration-preflight.mjs
npx prisma migrate status
```

The preflight is **read only**. Confirm the expected league and team counts. `migrate status` may report no migration history on a database created with `prisma db push`; that is expected, not permission to automatically mark a baseline. Save only the preflight verdict and redacted counts.

If the preflight says `UNBASELINED_POPULATED_SCHEMA`, compare the existing hosted schema against the version of `prisma/schema.prisma` on `main` **before** any migration or baseline resolution:

```bash
git show origin/main:prisma/schema.prisma > /tmp/john-scott-pre-migration-schema.prisma
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel /tmp/john-scott-pre-migration-schema.prisma \
  --exit-code
```

Exit code **0** indicates no Prisma-supported schema difference. Exit code **2** indicates drift and must block the baseline until reconciled; exit code **1** indicates an error. The Prisma schema comparison does not check unsupported views or triggers. Do not bypass a difference with `db push` or `--accept-data-loss`.

If `_prisma_migrations` already exists, inspect recorded/failed migration names first. Never rerun a successful migration, rewrite checksums, or mark an unrelated baseline as applied.

## 3. Migration rollout gate (only after explicit approval)
For a populated database without migration history:
1. Verify legacy schema equivalence as above and take an appropriate recoverable DB snapshot.
2. Resolve the *already existing* initial schema, **not** by executing the baseline DDL:
   ```bash
   npx prisma migrate resolve --applied 20261113000000_baseline
   ```
3. Apply the subsequent additive migrations:
   ```bash
   npx prisma migrate deploy
   npx prisma migrate status
   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
   node scripts/migration-preflight.mjs
   ```
4. Confirm the final preflight verdict is `HISTORY_READY`, the Prisma diff returns **0**, and league/roster/matchup counts agree with before-migration counts.

The added migrations only create `LoginThrottle`, `LineupPlan`, `LineupPlanEntry`, `DailyGameLineup`, and `DailyGameLineupEntry`, and remove the old `User.pin` SQL default. **No existing manager PINs, rosters, matchups or box scores are rewritten.** Existing literal PIN values must still be upgraded on successful login and managers should set strong unique credentials.

A database with **existing migration history** must be handled according to its verified history, not by blindly following the no-history baseline path.

## 4. Vercel preview and production gate
- [ ] Vercel preview for the final release SHA succeeds (the Hobby deployment quota has previously rate-limited previews).
- [ ] Verify `SESSION_SECRET` and `CRON_SECRET` are present, independent, and not shared in logs; `DATABASE_URL` targets the validated hosted database.
- [ ] Confirm a valid manager login, team/week display, future-week move saves to a plan without changing today's roster, DAILY historical scores stay associated with the game-locked team, waiver and trade authorization reject invalid actions.
- [ ] Verify NHL score sync and waiver cron auth through the existing bearer-token routes; no token in URL.
- [ ] Explicit reviewer approval, then coordinate **migration first, application release second**. Only merge and deploy after the verified schema supports the new Prisma queries.
- [ ] After deploy, monitor Vercel errors and scoreboard integrity; ensure the first next-week activation occurs before puck drop.

## 5. Rollback
The schema modifications are additive except removal of the insecure default PIN value. Rolling the application code back to the last known working commit is generally safer than reversing migrations. Do not drop new tables or reset the hosted database as a first rollback step. Reconcile any lineup plans activated in the live roster before retrying release.

## Deliberate exclusions
This release does not backfill unrecorded historical DAILY lineups or fabricate past box scores. Fixture-dependent historical NHL tests may remain skipped on isolated E2E data; their coverage is partially supplemented by pure and synthetic database tests. Historical reconstruction requires independently verified source data and separate approval.
