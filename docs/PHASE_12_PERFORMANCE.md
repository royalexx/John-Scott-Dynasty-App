# Phase 12 — Non-visual performance optimization

**Baseline:** PR #50 (`fix/preview-readonly-with-postgres`, SHA `7b29e559e7de81d3115979664da7632553a530fc`).
**Branch:** `ui/phase-12-performance`.
**Design constraint:** Phase 11 was explicitly rejected. The Match/Team/Players/League component structure, Match tab JSX, original player-row layout, portraits and compact spacing remain visually unchanged.

## Identified costs and changes

1. **Repeated search normalization.** `PlayersSubTabView` previously ran `normalizeSearchText` on each player's name, NHL team and position for *every search keystroke*. An immutable search index now normalizes those three fields once per player-pool change, then reuses the normalized strings. NHL team select options are also memoized instead of sorted every render. Case/accent-insensitive search logic and filters are unchanged.
2. **Full-registry lookup on player selection.** `dashboard-client.tsx` used two linear `.find()` scans of the registry to resolve every selected player's canonical profile. It now uses memoized first-match maps by NHL ID and normalized name. Roster-owner and dialog details are unchanged.
3. **Duplicate game-log processing.** Registry hydration previously concatenated and `findIndex`-deduplicated a player's game logs twice (quadratic work for long log lists). `mergeGameLogs` now retains the same first occurrence per `gameId` with a single Set-based linear pass, and reuses that result for both the stored log and weekly schedule.
4. **Avoidable matchup state updates.** `handleLiveSummary` previously created a new global matchup-state object even when the summary's contents were identical. It now returns the original React state if all summary fields match; changed score/projection values still update normally.
5. **Offscreen portrait downloads.** The app previously preloaded every roster portrait **plus the first 50 registry portraits**, regardless of which players were visible. Eager preloading is limited to eight distinct initial roster portraits, while `PlayerPortrait` uses native `loading="lazy"`, asynchronous decoding and React memoization. Authentic NHL image URLs, dimensions and fallback initials remain unchanged.

## Correctness and safety

- No JSX structure, CSS dimensions, fonts, color, scoring algorithm, lineup-lock policy, roster eligibility or matchup-navigation logic changed.
- No database migration, league seed, Prisma schema, authentication, session/PIN, waivers or trade API changes.
- Every phase is stacked on PR #50. `main` and `johnscottdynasty.live` remain untouched.
- UI Preview remains non-persistent and independent of PostgreSQL, even if `DATABASE_URL` is configured.
- No local storage or client-side persistence was added.

## Verification plan

- Existing visual baseline and preview tests ensure the approved mobile layout is unchanged at 320/390/430px.
- `visual/phase-12.spec.ts`: verifies authentic NHL portraits retain URLs, now expose lazy loading and async decoding; exercises Match/Team/League navigation, case-and-accent-insensitive search, clearing search, no horizontal overflow or API writes; attaches performance diagnostics and screenshots.
- Original database-backed E2E and legacy PostgreSQL migration rehearsal run against disposable CI PostgreSQL, never the live database.
- Production without `DATABASE_URL` must retain its fail-closed unavailable state.
- **No unmeasured percentage improvement is claimed.** CPU/search-loop complexity and reduced eager portrait count are code-level improvements. The attached browser diagnostics (FCP, DOM size and resource count) are observational; absolute latency should be checked on representative mobile hardware and normal production network conditions before quoting a measured gain.

## Rollback

Close the Phase 12 PR without merging, as was done for Phase 11. Revisit PR #50's preview for the original approved UI plus safe read-only fixture behavior.
