# Phase 8 — Combined release candidate and production-readiness gate

**Date:** November 14, 2026  
**Release branch:** `release/phase-08-integrated-candidate`  
**Target:** Draft PR #46 into `main`; **no merge/deployment/migration authorized**.

## What this branch contains

The repository has two independent, previously reviewed release stacks. Phase 8 combines their actual source trees in a **new, separate candidate branch**, with both source commits recorded as ancestry rather than copying one set over the other:

| Stack | Tip commit | Original draft PR | Scope |
|---|---|---:|---|
| Consolidated backend audit | `a01da991a1a8fc66e71fda3dcb4d87ca0ceb3edd` | #43 | Prisma migrations, future-week plans, immutable DAILY snapshots, auth/authorization, FAAB and roster safety |
| Approved compact UI | `23839f4c14f31d24a3267e915769185030182406` | #45 (built on #44, #40, #36, #34, #25, #14) | Match/Team layout kept compact, portrait-first Players lists, read-only preview, safer transactional sheets, keyboard/reduced motion |
| **Rejected Phase 4** | `639ecc689b5af0f5a96df11ecc2693784d7f9ebd` | #37 **closed** | **Not included, never merge** |

The combined candidate does not change hockey scoring rules, transaction algorithms, or image sources beyond changes already present in those two reviewed stacks.

### Overlapping source paths reconciled

Nine files were edited by both stacks and were explicitly inspected:

| File | Resolution |
|---|---|
| `AGENTS.md` | Combine backend migration/CI guidance with UI portrait/design system requirements |
| `README.md` | Keep backend's newer migration/E2E documentation; link UI and Phase 8 guidance separately |
| `app/dashboard-client.tsx` | Merge disjoint UI shell/preview changes and backend lineup persistence/DAILY updates |
| `app/page.tsx` | Merge backend scoring/loaded data and UI read-only preview/fail-closed unavailable screen; remove duplicate local `LeagueUnavailable` component |
| `components/hockey/matchup-panel.tsx` | Retain backend saved-score handling and compact UI's accessible labels |
| `e2e/07-league-integrity.spec.ts` | Backend's isolated database expectations |
| `e2e/08-weekly-lock-and-week-sync.spec.ts` | Backend's corrected week/lock tests |
| `package.json` | Backend's reproducible no-network build and seed config plus all UI read-only/production-no-DB test scripts |
| `playwright.config.ts` | Keep backend's fail-closed local `TEST_DATABASE_URL` requirements and isolated server; Phase 8 updates the read-only guard script accordingly |

`node scripts/check-release-candidate.mjs` verifies both approved Git histories are ancestors of the candidate, rejected Phase 4 is not, all migrations are present, NHL portraits still exist and are referenced, and mutating E2E tests cannot attach to a shared server. This guard **does not** prove production database isolation; it checks the staged source only.

## 1. CI gate — isolated from user data

The draft PR to `main` runs two independent GitHub Actions workflows:

- **Pull Request Quality Gate:** TypeScript + build, disposable PostgreSQL full Playwright and fresh migration, legacy populated `db push` → versioned migration rehearsal, release source/ancestry guard. All database fixtures are temporary runner-local PostgreSQL instances.
- **UI visual baseline (read-only):** TypeScript, E2E guard contract, 320/375/390/430px baseline and phone-shell tests, 50+ preview interactions, explicit no-database production test, build, screenshot and JSON measurement artifacts.

Before approval, link the **final-head** workflow runs and list the exact pass/fail totals. Any subsequent commit invalidates earlier green checks.

## 2. Hosting/environment gate — BLOCKED as inspected

On November 14, 2026 the connected Vercel project `john-scott-dynasty` (custom domain `johnscottdynasty.live`) reported project environment variables:

- `CRON_SECRET`: configured for Production and Preview
- `SESSION_SECRET`: configured for Production and Preview
- **`DATABASE_URL`: absent** (no other hidden Production variables listed)

The last-known successful Vercel Preview **does not** establish that a real league PostgreSQL database exists, that authenticated league data loads, or that writes will persist. Read-only sample previews explicitly do not use a live DB.

**Do not** run `db push`, seed, `prisma migrate deploy`, or any NHL sync/waiver cron against an unknown connection string. The missing `DATABASE_URL` must be resolved by the owner with an explicitly identified database provider and verified target environment. Preview and Production must not share a mutable database. Keep secrets in Vercel environment settings; do not paste into a PR, screenshot or chat.

### If there is an existing league database

Use the [backend read-only migration preflight](backend-production-release.md) from the trusted environment holding the **correct** connection string. Confirm identity, schema, league/team counts and `_prisma_migrations` history. If this is a populated `db push` database, verify old-schema parity before marking the baseline applied; only after owner approval can subsequent additive migrations run. Have a recoverable snapshot before any write migration.

### If the product never had a persistent league database

This is a **separate first-time database provisioning decision**. An empty, owner-approved database can be initialized with versioned migrations, followed by a controlled first-league data import/seed procedure explicitly reviewed for the target environment. The development seed refuses Production by design; do not bypass its guard. First confirm that no league data exists elsewhere before creating or seeding.

## 3. Production release procedure — NOT EXECUTED

1. Review PR #46 source, screenshots and isolated CI results; confirm it includes only intended backend and UI changes.
2. Identify the actual Production PostgreSQL database and configure an independently isolated Preview target.
3. Run **read-only** hosted migration preflight and history/schema parity checks. Record only non-sensitive verdict/counts.
4. Approve a recoverable backup/snapshot and a specific migration plan. **Stop if schema drift, unknown history, or an inaccessible target is found.**
5. With a separate explicit deployment authorization, apply only appropriate migrations **before** running any new Prisma queries in production.
6. Stage an exact production-target build without assigning the public domain; verify login, roster, immutability, waiver/trade rejections, and live-data display with controlled accounts.
7. Promote the validated production-target deployment to `johnscottdynasty.live`, then check NHL sync/cron authorization, game scores, logs and error rates.
8. If release verification fails, roll back the application deployment, preserving additive migration tables and user data; investigate before retrying.

A **Preview** build is not the same artifact as a **Production** build. A green Vercel Preview or GitHub Actions build alone never satisfies steps 2–7.

## 4. Non-negotiable UI continuity

- Retain the approved **pre-Phase-4 Match and Team structure**.
- Preserve authentic NHL player headshots across rosters, matchup, market lists, search, leaders, trade, waiver, draft and player details.
- Keep four tabs, swipe semantics, 430px mobile shell, 320px support, reduced-motion behavior, correct actual vs projected labels.
- Never show static demonstration rosters or scores as live data when Production's database is missing.

## Approval checklist

- [ ] Final Phase 8 combined PR quality + visual CI green
- [ ] Final-preview screenshots inspected; no missing NHL portraits
- [ ] Reject Phase 4 ancestry verified
- [ ] Backend migrations pass both fresh/legacy isolated tests
- [ ] Database provider and target identified (Production)
- [ ] Separate read-only hosted preflight and migration history reconciled
- [ ] Preview/Production database isolation independently verified
- [ ] User approves any real database migration and production release
- [ ] Rollback and smoke-test owners selected

**Current disposition:** safe to review source and preview, **not** safe to merge/deploy with unresolved database target/history.
