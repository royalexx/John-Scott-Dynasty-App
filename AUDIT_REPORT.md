# John Scott Dynasty – Audit Report

## Final status
| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Pass |
| `npm run build` | Pass |
| `npx playwright test` | 17 / 17 pass (7 regression tests in `e2e/05-audit-regressions.spec.ts`) |

## Issues found and fixed

### Matchups
- **Projections shown as actuals** (away D showed 29.4 instead of 0.0). Actual and projected points are now separate: `getWeekActualPoints` returns 0 for unplayed games / other weeks, `getWeekProjectedPoints` is only used for projection labels. `PlayerSchedule` is now week-tagged.
- **Upcoming weeks** reset to 0.00 vs 0.00.
- **Away player cards** now open the profile (looked up in `allDynastyPlayers`).
- Files: `lib/hockey-data.ts`, `components/hockey/matchup-panel.tsx`, `app/dashboard-client.tsx`.

### Commissioner / auth
- `isCommissioner` is decoded the same way in `app/api/auth/session/route.ts` and `lib/auth-session.ts` (DB is source of truth).
- `@commissioner` / Montreal Monarchs seeded as commissioner (`prisma/seed.ts`).
- Saving league settings (`PATCH /api/admin/league-settings`) refreshes client state (`commissioner-settings-dialog.tsx`, `dashboard-client.tsx`).

### Waivers
- Claims without a drop are allowed when the roster is under 27 (`lib/services/transactions.ts`, `waiver-claim-dialog.tsx`, `lib/db/rosters.ts`).
- Waiver dialog now receives `teamId`, so claims persist to the DB.

### Teams
- Ghost teams (Edmonton Ember, Minnesota Northstars) removed; the 12 canonical handles are shared by Standings, Matchups, Trade Builder and DMs (`lib/hockey-data.ts`, `lib/dashboard-data.ts`, `trade partners` in `dashboard-client.tsx`).
- Duplicate React keys in the league feed fixed (`league-feed.tsx`).

### Performance
- Player list is fetched once; types deduped.
- `React.memo` / `useMemo` / `useCallback` on `PlayerItem`, `PlayersMarketView`, `MatchupPanel`, derived roster lists; new `lib/use-stable-callback.ts`.

### UI
- Gear icon opens the unified settings drawer with Switch Team / Log Out.
- Chat bar docks to the safe area.
- Market filters: F = C/LW/RW/W, W = wingers only, G swaps sort controls to W, SV, SV%, GAA, SO; roster-owned players excluded from Free Agents.

### Repo hygiene
- `.gitignore` now covers `.env`, `*.tsbuildinfo`, `repomix-output.xml`, `test-results/`, `playwright-report/`; those and `e2e/.auth` were removed from the git index (files stay on disk).

## Side effect of my test runs (repaired)
Enabling waiver persistence meant the e2e waiver test wrote real claims to the shared Neon DB, and the `/api/cron/waivers` e2e test then processed them. Over 4 runs this swapped Matthews and MacKinnon out of Montreal Monarchs for Nikishin and Pietrangelo and spent 4 FAAB.
Repair (limited to those records): re-added Matthews and MacKinnon (slot C), removed the two pickups, FAAB back to 100, Montreal back to waiver priority 1 (others shifted +1), deleted the 4 test claims and their 8 activity-log rows.
Caveat: lineup swaps from earlier e2e runs may have rearranged slots (e.g. a D in a G slot); I could not know the original arrangement.
Prevention: the waiver and lineup-swap e2e tests now mock `/api/waivers` and `/api/roster/move`.

## Round 2 (requested follow-up)

### Data fixes (live Neon DB)
- **Duplicate teams removed.** The re-seed had created second accounts for `wisconsin`, `melchior` and `jordan`. Their matchups were moved onto the original accounts (`WisconsinVVB`, `Melchior1`, `danick504`), then the duplicate teams, picks and users were deleted. The league now has exactly 12 teams and waiver priority is 1..12. Seed and standings now use the real handles so a re-seed cannot recreate duplicates.
- **Taxi threshold = 50 GP** everywhere: `TAXI_MAX_NHL_GAMES`, seed, Prisma default, settings defaults, `.cursorrules`, UI text.
- **Wingers were stored as C.** `lib/services/nhl-sync.ts` mapped NHL boxscore codes `L`/`R` to C on every sync. Fixed, and 190 players repaired from `public/data/nhl-players.json`.
- Montreal lineup repaired (a D was in a G slot, a D in a flex F slot). Pius Suter was on two teams; removed from Boston.

### Bugs fixed
- Team header showed a hard-coded `1-1 • 4th`, `PF 356.06`, `PA 318.40`; now real record, rank, streak, PF/PA and the team logo.
- Opponent rosters came from mock data, so players like Matthews appeared on two teams. All teams now use database rosters (`setLeagueContext` in `lib/hockey-data.ts`, fed from `app/page.tsx`). The logged-in team is no longer hard-wired to "Montreal Monarchs".
- Weekly projections were inflated 3x for players without stats (a whole-week placeholder was treated as per game).
- Market cards showed a hard-coded `vs BOS` and a stray `0` for injury status. They now show the real opponent.
- FPTS sort ordered by season stats while the card displayed the projection. It now sorts by the value shown.
- Win probabilities were fixed at 50% / "52% vs 48%". They now come from projections.
- Rulebook edge cases: an empty draft date crashed (`toISOString` on an invalid date), and late-loading settings could overwrite edits.

### Interface upgrades
- **League Settings drawer** is rebuilt (`league-settings-panel.tsx`). It shows your team, rank, FAAB and waiver priority, and a read-only rules summary for every manager. Commissioners also get tools and a co-commissioner list with a Grant/Revoke button per manager.
- **Commissioner Rulebook** is rebuilt (`commissioner-settings-dialog.tsx`):
  - tabs for Roster, Scoring, Waivers, Trades, Draft and Tools;
  - steppers, segmented controls and toggles;
  - a sticky Save bar with an "Unsaved" badge and Discard;
  - validation (at least one goalie slot, valid draft date);
  - live roster-capacity maths.
- Lineup health banner on the Team tab (empty slots, injured or day-to-day starters, IR eligibility), like Sleeper and Yahoo.
- Players market: "Show 50 more" pagination with a count, cleaner stat grid, real opponents.
- League tab: podium shows projected totals (labelled) before games are played.

## Open items - resolved
- `PATCH`/`POST /api/trades` now require a session. Only the receiving team (or a commissioner) can accept or reject, only the proposer can cancel, and you can only propose from your own team.
- `e2e/04-api-endpoints.spec.ts` no longer runs `/api/cron/waivers`. It now checks that an unauthenticated call is rejected, and the same for trades.
- Taxi games played: the seed now reads the registry's `nhlGamesPlayed`, and 89 players were corrected in the DB. Players with no registry value still default to 0 GP (about 1,850), so the server treats them as taxi-eligible. A real career-GP source is still needed.
- `.env` is untracked and ignored. Rotating the secrets is up to you; they are in git history.
- Removed the dead `league-panel.tsx` and `league-standings-view.tsx`.
- `rosterSize` still equals the sum of `rosterPositions` including BN, by design.

Tests: `tsc` clean, Playwright 18 / 18.
## Lineup moves reverting after a rules change
Symptom: a move to IR looked successful, then reverted after saving commissioner rules (which reloads the page).
Root causes:
1. **Permanent roster locks.** `enforceRosterLocks` in `lib/services/nhl-sync.ts` locked every player whose team had *ever* started a game and never unlocked them. After a sync, 200 of 202 slots were locked, so the server rejected every move with "slot is locked". Locks are now daily: only players whose team's game today (US/Eastern) has started are locked, and the rest are released. The 200 stale locks were cleared.
2. **Errors were swallowed.** The client updated the UI optimistically and only logged network errors, so an HTTP 400 never rolled the move back. It now rolls back and shows the server's message.
3. **The swap logic was wrong.** With a full target slot (IR holds 1) the server benched the mover instead of placing them in the slot, so the move did nothing. It now swaps the two players properly and validates both: pure IR, taxi GP cap and position eligibility. The client sends the exact swap target.
4. `/api/roster/move` now requires a session and only allows editing your own team. The IR dialog only offers IR to players whose status is IR.

New e2e tests: an injured player swaps into a full IR slot, persists and is reverted; a healthy player is rejected from IR. Playwright 20 / 20.
## Round 4: NHL week sync, retroactive scoring, weekly lock, test suite

- **Calendar**: weeks are Monday to Sunday; week 1 of 2026-27 starts Mon 2026-09-28, so Mon 2026-10-12 is week 3 (lib/season-calendar.ts). League.currentWeek is now updated by the sync from the calendar and can no longer be hand-set.
- **Root cause of wrong schedule data**: the sync stored every game of a schedule request under the requested date, so a whole week sat on one day. Games now use their real date.
- **Retroactive scoring**: /api/cron/sync rescans weeks 1..current from NHL boxscores (?backfill=1 pulls the whole season), scores starters only with the league's scoring rules, and marks weeks final once the week is over and every NHL game is finished. Editing scoring in the rulebook re-prices all stat lines and rebuilds every matchup.
- **Standings** now come from final matchups (lib/standings.ts), including ties and streaks. The league feed no longer overwrites season points with the current week's score.
- **Weekly lineup lock** (default) plus a Daily option: new League.lineupLockMode, editable in Commissioner settings, Roster tab. Locks are computed live from the schedule at move time. Injured (IR status) starters can still be moved to IR.
- **Data repaired**: Montreal's taxi players over the 50 GP cap (Celebrini, Power) moved to bench; other teams' starters sitting in slots they cannot play (goalies in D, centers in W, etc.) were re-slotted by position and season points.
- **Tests**: 81 total (80 pass, 1 conditional skip). New specs: 06 rules engine (calendar, scoring, standings, locks), 07 data integrity and retroactive scores, 08 weekly lock and week sync, 09 mobile layout.
