# Phase 9 — Team lineup decision UX

**Branch:** `ui/phase-09-lineup-usability` (stacked on draft Phase 8 integration PR #46).  
**Goal:** improve the approved compact Team lineup rather than redesign Match/Team. Preserve authentic NHL player headshots in all rows and the swap drawer.

## Shipped UI changes

1. **Lineup alert → useful action.** `LineupAlerts` identifies the first empty eligible starting slot, then injured, out-of-position, day-to-day, taxi-ineligible and IR-placement issues. If editing is allowed for the selected fantasy week, it offers a single contextual **Fill empty C slot** or **Review [player]** action. That action only opens the existing eligibility-aware `LineupSlotDialog`. It never writes a roster update until a manager actively chooses a player/target.
2. **Week-aware warnings.** The health summary now uses `rosterForDisplay`, which follows the selected week's frozen/planned assignments rather than always comparing today's live roster. Warnings are suppressed for explicitly unavailable historical snapshots; a live-week lock notice does not incorrectly appear on a different week. Action links are withheld for past, frozen or fully weekly-locked lineups; the existing read-only lock messaging remains.
3. **Week navigation.** Previous/Next now have minimum 44×44px touch targets, focus rings, boundary disabled states, and an announced, tabular-number week label. The four main tabs and swipe gestures remain unchanged.
4. **Roster and taxi edits.** Slot edit buttons are labeled by player and slot, use at least 44px targets, and are keyboard accessible. Player portraits, player details and points displays are unchanged.
5. **Swap drawer.** Close and target-selection controls are larger and explicitly labeled (e.g., **Fill C with [name]**). Eligibility calculations and onMove payloads remain unchanged.

## Safe visual review and testing

The restricted design-system gallery has a fixture with exactly one empty starting C slot and eligible NHL bench players. It opens the real swap drawer using real headshot components. Choosing a candidate only sets the fixture message **Preview only · Lineup unchanged**; it calls no backend endpoint.

`visual/phase-09.spec.ts` tests:
- 320 and 390px Team navigation, week forward/back and 44px controls
- Named roster edit buttons and safe close behavior
- No horizontal overflow and real player portrait URLs
- A deterministic warning CTA, eligible choices and a simulated selection with **no API writes**
- Existing Phase 0–7 visual and production-no-database suites remain in CI

**Do not run mutating E2E tests against hosted PostgreSQL.** The database-backed GitHub job uses disposable local PostgreSQL only.

## Explicit exclusions

No changes to PostgreSQL schemas/migrations, league seeding, hockey scoring, waiver or trade transactions, roster eligibility, future-week storage, NHL sync, actual player-photo sources, or production hosting settings. No redesign of Match, Team, Players, or League screen architecture. Phase 4 PR #37 is still excluded.

## Rollback / approval

Review the draft PR screenshots and optional Vercel preview, then approve separately. No merge to `main` and no production migration/deployment is implied. Closing this PR leaves the combined Phase 8 candidate untouched.

PostgreSQL environment variable keys are present in Vercel as of Nov 14, 2026, including `DATABASE_URL`, but their values were not decrypted. Since variables target both Preview and Production, **environment isolation has not been proven**. Confirm separate database identities before using live authenticated Preview writes or database migrations.
