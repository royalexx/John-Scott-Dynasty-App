# Phase 6 — Transaction and settings UX (compact, portrait-preserving)

**Base:** Phase 5 approved visual direction, branch `ui/phase-05-players-league` (draft PR #40).  
**New stacked branch:** `ui/phase-06-workflows`.  
**Scope:** UI only — trade builder, waivers, draft room, player profiles, Team and commissioner settings, transactions drawer.

## Design decision

The owner explicitly rejected Phase 4's larger, card-heavy Match and Team redesign. Phase 6 intentionally keeps the familiar compact layouts and uses small accessibility/interaction corrections. It does not reintroduce or inherit the abandoned Phase 4 branch. Authentic NHL portraits remain part of every player-focused screen.

## Changes by workflow

### Trade proposal builder

- Preserved the existing three steps: **Partner → Assets → Review/Send**, and all existing selection, draft pick, FAAB and trade-submission logic.
- Exposed step state through an accessible progress indicator, increased back/close and draft-pick targets to at least 44px and added an explicit trade-note label.
- Retained all existing player photo thumbnails, including the AssetList's player detail button.
- Bounded the sheet by dynamic visual viewport and added bottom home-indicator padding.

### Waiver claim review and Transactions

- Kept the bid, FAAB balance, roster-full/drop validation, claim review and backend submission exactly as before.
- Replaced the generic hockey emoji in the waiver sheet header with the **actual selected NHL player's portrait** via the existing `PlayerPortrait`.
- Added a **Back to waiver selection** button in the confirmation step, preserving the bid and selected drop player while clearing an old local error. Users can correct a choice without dismissing and reopening the sheet.
- Increased target sizes, focused number input and made the selected drop row accessible through `aria-pressed`.
- The transactions cancellation confirmation now uses explicit **Keep claim / Cancel claim** language. No cancellation API or behavior changed.

### Draft room

- Preserved the draft board, round/timer, queue, player selection, commissioner actions and draft API.
- Added real player photos in the available-player and queued-player rows without changing the compact list structure.
- Added an explicit search label, pressed-state indicators for board/players/queue and position/timer controls, and 44px touch targets for Exit, settings, filters and queue removal.
- The existing independent Queue vs player selection behavior and read-only fixture network guard remain covered in CI.

### Player details and settings

- Player profile still has its original 64px NHL headshot, Summary/Log/Team/History/News tabs and bottom Add/Claim/Trade actions.
- Accessible `aria-pressed` on those tabs, 44px close/trade-block controls; newly opened profiles start on **Summary**, not the previously viewed player's tab.
- Team customization has labeled name/logo fields, 44px Save and Close controls. No actual settings are persisted during tests.
- Commissioner rulebook has 44px +/- steppers, tabs, segmented options, switches, Save/Discard buttons. Permissions, validation and updates are unchanged.

## Explicit exclusions

No modifications to `app/dashboard-client.tsx`, Match/Team home screens, Players/League core list layout, Prisma schema, database migrations, trade/waiver/draft/roster/lineup eligibility algorithms, backend endpoints, credentials, scoring rules, or deploy configuration.

## Validation / approval

Run `npx tsc --noEmit`, fail-closed database guard, original visual baseline, read-only Playwright preview regressions (Phases 1, 2, 3, 5 and 6), production-no-database tests, and `npm run build`.

Phase 6 tests capture player profile at 320 and 390px, waiver review and navigation back, trade partner/assets/review steps without sending, Team settings with no Save, and fixture draft player/queue portraits without writing. Review uploaded screenshots, verify no horizontal overflow and inspect the back/close paths.

Keep PR as **draft** and do not merge to `main` without the user's explicit approval. If Vercel Hobby limits preview builds, review the GitHub Actions screenshots rather than claiming a hosted deployment.

## Rollback

Close Phase 6 PR without affecting Phase 5 or production. No data rollback is needed because this phase makes no data/schema changes.
