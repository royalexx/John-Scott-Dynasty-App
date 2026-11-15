# Phase 11 — Matchup usability, headshots, scoring hierarchy and safe editing

**Branch:** `ui/phase-11-matchup-usability`, stacked on draft PR #50 (`fix/preview-readonly-with-postgres`).
**Scope:** Preserve the approved compact four-tab Match/Team/Players/League UI. Rejected Phase 4 card-heavy redesign is excluded.

## Changes

1. **Real NHL portraits in starter comparisons.** The shared `PlayerPortrait` component now appears beside both teams' starting player names. It uses existing player IDs and headshot sources and retains initials fallback if an image cannot load. Truncation remains visually compact, with full player identification in the accessible player button.
2. **Actual versus projected points.** Player comparison columns explicitly label `Actual` and `Proj.`. The matchup header calls its scored totals `Actual points` and continues to show separate projected team totals. No values or scoring formula have changed.
3. **Scoring-week navigation.** Match week Previous/Next buttons are 44px square with keyboard focus styles, disabled week-1/week-24 boundaries, announced week labels and swipe gestures subject to the same bounds. Matchup carousel arrows and selectors also have 44px minimum targets.
4. **Safe roster edits.** The matchup slot edit buttons are 44px square and name the player/slot. They are disabled when the matchup is not the logged-in manager's, when viewing a past or unavailable week, while another week's lineup is loading, or when the selected lineup is frozen/locked. The selected week's authoritative `lineupLock` is passed from the dashboard. Read-only notice states explain why editing is disabled.
5. **Reserves.** Disabled position badges no longer look like functioning edit buttons when `onEditSlot` is not provided. Existing eligible swap selection remains delegated to `LineupSlotDialog` and the parent roster handler, unchanged.

## Testing

`visual/phase-11.spec.ts` is added to the Preview-only Playwright suite and checks at 320px, 390px and 430px:
- Authentic portrait URLs on both sides and visible, separate actual/projection labels.
- 44px touch controls on week and matchup navigation and starting position edits.
- A swap drawer can open and close without an API write.
- Past-week edit buttons are disabled with an explanatory notice.
- No page-level horizontal overflow.
- Week 1 and week 24 limits with no mutating requests.

Read-only Preview tests run with a deliberately unreachable `DATABASE_URL` and never connect to hosted PostgreSQL. Existing baseline, production-without-database and disposable-PostgreSQL tests remain required.

## Exclusions and approval

No Prisma migrations, NHL calculations, roster eligibility rules, transaction APIs, session/PIN authentication, season schedule, image source changes, league records, or Vercel production settings. There is no automatic roster mutation.

This is a draft review phase. Review the exact Vercel Preview commit and CI screenshots before approving; production `main` and `johnscottdynasty.live` are unchanged.
