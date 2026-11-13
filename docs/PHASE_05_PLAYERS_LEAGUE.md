# Phase 5 — Players and League: compact refinement

**Baseline:** Phase 3's actual code (`ui/phase-03-navigation-shell`), not Phase 4.  
**Owner design direction:** Prefer the original *cleaner, simpler* screen structure over the Phase 4 card-based redesign. Phase 4 PR #37 was **closed without merging** on November 13, 2026. Its Match/Team files and swipe-pager changes are not inherited.

## Design boundaries

Keep the four-tab application shell and existing Players/League layout. Do not introduce large summary cards, new navigation destinations, extra layers of panels, new typography systems, decorative backgrounds or artificial hockey stats. Follow `DESIGN.md` for semantic colors and accessibility, with restrained application.

### Players

- Available, Search and Leaders retain their compact row-based layouts and original filters, ordering, values and player-detail callbacks.
- Replace position-only square avatars with existing `PlayerPortrait`, which sources *real NHL player photos* via `getPlayerPhoto()` and keeps the established crop, URL and failed-image fallback. A textual position label remains beside the team/schedule metadata.
- The Available list retains the FA/waiver indicator, projected/actual scoring label, claim button and show-more pagination. An explicit empty message appears when no players match filters.
- Search keeps its typeahead input, owner and NHL-team filters, and empty-result messaging. The input/clear buttons meet a 44px touch area; Search and Leaders use portraits at 36px.
- Trade tab and existing offer/asset dialogs are preserved. Existing action and filter buttons get >=44px heights; no trade workflow/data changes.

### League

- Keep the existing sequential sections: Draft (when present), Weekly Podium, Matchups, Standings, Activity. Do not replace these with a card dashboard or separate navigation.
- Slightly streamline spacing, borders and text contrast, with small NHL-adjacent status colors but no decorative redesign.
- Make League week arrow buttons 44px.
- Correct the standings column heading from “Waiver” to “FAAB” (the cells already contain `faabRemaining`). Remove an unsupported literal “(6)” displayed beside each manager's FAAB.
- Remove placeholder values “BID $5” from activity cards and the invented `MAX = ceil(PF × 1.08)` statistic from standings details. These were UI placeholders, not grounded game values.
- Keep league score calculations, podium ranking basis, standings order, matchup navigation, trade hooks, filters, playoff bracket and activity handlers unchanged.

## Preserved from Phase 3

- The original Team and Match components and their visual layout: `components/hockey/team-header.tsx`, `components/hockey/player-item.tsx`, `components/hockey/matchup-panel.tsx`, `components/hockey/matchup-banner.tsx`, and the team section in `app/dashboard-client.tsx` are **not edited**.
- Main application shell, `SwipePager`, safe-area chat dock and reduced-motion handling are unchanged.
- No Prisma migration/schema, game rules, NHL data ingestion, roster lock, scoring or transaction endpoint changes.
- Existing direct player headshot images, team logos and accessibility behavior remain present.

## Review and testing

Run read-only Playwright against an isolated, database-free fixture at **320, 375, 390, 430px**. Capture actual Players Available and League renders at all four widths, plus Search/Leaders at 390px. Assert authentic NHL portrait `img src`, no document overflow, 44px claim/league-week actions, working filters, Trade navigation and Phase 3 Match/Team structure retained.

Run prior visual and safety regressions, TypeScript and Next.js production build on each PR commit. Merge only after review. Vercel Hobby's deployment quota might block a hosted preview; GitHub Actions screenshots are valid review artifacts but do not constitute a live deployment.

**Release gate:** All tests pass, screenshots visually reviewed, real portraits visible and owner approves this intentionally minimal approach. Draft PR stays unmerged until then.
