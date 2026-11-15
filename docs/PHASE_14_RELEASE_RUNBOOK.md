# Phase 14 — Final initial release candidate and production handoff

**Project:** John Scott Dynasty, `royalexx/John-Scott-Dynasty-App`.
**Production domain:** `johnscottdynasty.live`.
**Candidate:** `release/phase-14-launch-candidate`, built on Phase 13 PR #53.
**Target:** `main` **only after review**. The current `main` is the older test build.
**Design:** Preserves the approved pre-Phase-11 Match tab, authentic NHL player portraits, four-tab navigation, and the Phase 12 nonvisual optimizations. Rejected Phase 4 and Phase 11 changes are excluded by the existing ancestry checks.
**Production state:** No merge, migration, seed, Vercel environment edit or production promotion during this phase's preparation.

## Actual blockers, not hypothetical ones

1. **Environment separation is unverified.** Vercel exposes `DATABASE_URL` and its pooled/provider variants from the **same integration store/configuration** to Preview and Production. The UI Preview deliberately serves sample data, and it is **not** proof of a different database. There is currently no Vercel custom staging environment in this project.
2. **Production database state is unknown.** The Phase 13 doctor and migrations passed only on ephemeral PostgreSQL. No read-only report has been run against the hosted production DB through a protected runner. Do not infer that it is empty or migrated.
3. **Existing live deployment is stale.** Vercel reports a production deployment of SHA `9724aaa1b960f157c771cd8688a8282c5e67c543` (different from GitHub `main` and from the draft release). Function error logs on November 14, 2026 reported `DATABASE_URL` missing on that deployment. New Vercel environment bindings do not retroactively recompile an old deployment.
4. **Real league identities and roster assets are not provisioned.** The Phase 13 isolated rehearsal created 12 manager/teams, 144 matchups and future picks. The real managers' handles, PINs and roster allocation must be approved; no live account credentials have been provisioned.
5. **Auto-deployment risk.** The Vercel Git integration can deploy automatically from its configured production branch when a PR is merged. **Do not merge this release PR to main** while any of the above remain blocked.

## What Phase 14 implemented

- A single **consolidated draft PR against `main`** to review every accepted UI/backend/database change together rather than requiring incremental merges of all stacked PRs.
- `docs/PHASE_14_RELEASE_EVIDENCE.json`: a manifest with eight launch prerequisites, initially `pending`. It contains no PINs, connection URLs or secrets.
- `scripts/phase14-release-gate.mjs`: offline release preflight, **never** runs a database query or deployment.
- `npm run release:audit`: reports the pending checks but exits successfully so review CI can pass.
- `npm run release:verify`: strict mode requires a verified, non-sensitive evidence reference for **all eight** checks; additionally requires `APPROVED_RELEASE_SHA` matching the current Git HEAD and `RELEASE_OWNER_APPROVED=YES_FOR_THIS_EXACT_SHA`. It fails with exit code 2 until those conditions are met.
- Node regression tests proving incomplete evidence, wrong target, and absent exact-commit owner approval cannot pass the strict gate. CI runs these tests and prints the blocked release status, without using production credentials.
- The existing full Prisma/database/legacy-upgrade/UI suites remain mandatory. The UI preview retains sample data and blocks writes even if its environment contains a PostgreSQL URL.

**The evidence manifest is a checklist, not a digital signature or proof of database identity.** A protected operator must independently validate the cited evidence. Never treat a changed JSON file alone as permission to deploy.

## Protected release workflow

### Gate A — Database targets and isolation

- Create a separate staging PostgreSQL database (ideally a separate project/integration). Do not simply reuse the Production connection string for Preview.
- Compare production and staging identities from inside independently authorized environments; verify the endpoint, PostgreSQL database and role with **non-secret read-only metadata**, and verify staging credentials cannot alter production.
- Review the Preview/Production environment-variable scopes without decrypting or pasting secrets in chat. Ensure Preview does not inadvertently share the Production database before enabling live staging mutations.
- Keep PR previews on the existing `SAMPLE DATA · READ ONLY` mode. A live staging build must use its own explicitly approved environment and database.

### Gate B — Read-only production inspection

From an approved protected runner with production DATABASE_URL supplied as a masked secret **only for the inspection command**:

```sh
node scripts/migration-preflight.mjs
npm run league:readiness
```

Record only the sanitized migration/league verdicts in the private release record, without URLs, PINs or personal identifiers. Distinguish:
- **Migrated and populated:** preserve identities and records; do not seed or re-baseline.
- **Populated old db-push schema:** follow the additive legacy migration review after separately confirming its precise schema/history; never run baseline CREATE TABLE statements blindly.
- **Empty migrated DB:** bootstrap/onboard a real league only under a separate release-approved procedure.
- **Unmigrated/unknown schema or error:** block release; investigate without modifying data.

If existing user data has value, snapshot it before any separately approved migration. The earlier test-build/no-backup preference does not justify making a destructive change to a database whose state has not been verified.

### Gate C — Staging realism and manager access

- Provision the **staging** league only using actual proposed team/manager assignments and manager PINs through protected standard input. `npm run league:bootstrap` is validation-only unless explicitly invoked with `-- --apply` and the Phase 13 staging-only safeguards. Do not create demo manager credentials on production.
- Do not invent existing NHL roster assignments. Obtain the league's draft/import decisions and validate unique owners before a real roster write.
- Test each manager's own PIN, commissioner permissions, PIN change, stale-cookie invalidation, persistence after re-connection, weekly/daily lineup locks, waiver transactions, draft picks, trade authorization, and NHL game synchronization against **isolated staging** only.
- Ensure calendar/week boundaries and retroactive score computations remain correct when production-like data is present.

### Gate D — Candidate, approval and rollout

- Inspect the consolidated draft PR against `main`, especially `app/page.tsx`, auth, Prisma migration SQL, and Vercel cron handlers.
- Require green `static-checks`, `database-smoke`, `legacy-upgrade-smoke`, `phase13-readiness-smoke`, and `visual-baseline` on the **exact head SHA**. Confirm the original compact Match tab in the preview.
- Mark an item `verified` in the evidence manifest only after checking its independent evidence; do not store secrets in the manifest.
- Set the approved exact SHA in `APPROVED_RELEASE_SHA` in a protected environment, and obtain explicit owner sign-off for that SHA. Run `npm run release:verify`. A green result only means the release **may be staged**; it does not deploy.
- Stage a production build without replacing the live domain first (`vercel deploy --prod --skip-domain`, if that workflow is supported by the configured Vercel project). Verify its commit, bound env targets, startup, authentication, cron and read-only functional health. Production staging and secret-bearing builds must run through a protected reviewed pipeline, not an untrusted PR build.
- Only after the staged production build passes all gates and the owner separately approves promotion, promote that exact build to `johnscottdynasty.live`.
- Check real runtime errors and database health after promotion. Confirm that session, league, and roster data survives a new request and restart.

### Gate E — Rollback

- Record the pre-release deployment ID and Git SHA. Retain database snapshots only when meaningful data exists.
- For a code incident, stop writes, assess whether the previous build is schema-compatible and use Vercel rollback/promotion to restore the prior known-good build. **Do not use `prisma migrate reset` or automatically roll back database migrations.**
- If the prior build is not compatible with applied schema changes, maintain the new schema and deploy a compatible code hotfix rather than blindly restoring the old runtime.
- Diagnose and separately recover any data issue; a Vercel code rollback does not restore PostgreSQL data.

## Evidence manifest keys

| Key | Evidence required before `verified` |
| --- | --- |
| `candidateBuildAndRegression` | Exact head SHA, all complete CI checks and approved visual screenshots |
| `stagingDatabaseIsolated` | Independent metadata comparison and staging-only access-policy test |
| `productionDatabaseMigrationInventory` | Protected read-only `migration-preflight` verdict |
| `productionLeagueReadiness` | Protected read-only `league:readiness` verdict or reviewed initialization plan |
| `realManagerCredentialsAndAccess` | Secure account/PIN onboarding decision, never actual PIN values |
| `stagingEndToEndOperations` | Staging login, roster, lineup, waiver, trade, draft, NHL sync results |
| `rollbackAndMonitoringReview` | Recovery plan, monitored staged build and deployment IDs |
| `ownerReleaseApproval` | Explicit approval record tied to the exact candidate SHA |

## Release decision

**Current decision: BLOCKED for production, READY for draft PR review.** This is the final *planned phase* of the initial overhaul, but actual go-live remains a separate gated decision. Post-launch bugfixes and optional feature development may create subsequent phases.
