# Phase 4 — Match and Team screen redesign

**Branch:** `ui/phase-04-match-team`  
**Base:** `ui/phase-03-navigation-shell` (draft PR #36)  
**Status:** Stacked draft for visual approval; no deployment to `main`.

## Scope

This phase refines the two most frequently inspected screens—head-to-head Match and the fantasy Team roster—using Phase 2's semantic palette and Phase 3's mobile shell. It **does not** change Prisma, NHL statistics, scoring rules, lineup lock eligibility, roster moves, trade processing, waiver claims, draft ownership, or API endpoints.

### 1. Match scorecard
- Make **actual fantasy points** prominent for both managers and clearly label **projected points** separately. No calculated or pseudo-calibrated win probabilities.
- Clarify the scoring week, matchup state and games remaining. Final matchups say `Completed` instead of implying games are still pending.
- Use a bordered dark surface with restrained accenting and fixed tabular numerals.

### 2. Match comparison and reserves
- **Real NHL portraits added to both sides of each player matchup row**, sourced through the existing `PlayerPortrait` and `getPlayerPhoto` mechanism. No replacement image generation or icon-only players.
- Preserve opponent identities, injury tags, schedule detail, nickname, actual scores, projections, game stats and player-detail onClick.
- Clearly separate matchup chooser, weekly controls, starting-lineup comparison, and bench/IR/taxi reserves. Match navigation still uses `SwipePager` and previous/next buttons.
- Use the same C/W/F/D/G colors as the common UI design system. Editable center roster slots receive 44px targets.

### 3. Team profile card
- Team identity and logo receive clear visual precedence.
- Standing, rank and streak remain; `FAAB`, points for and points against appear in a three-column stats strip, with no fabricated default values if an entire summary is absent.
- Four functional actions (Schedule, Trade, Activity, News) are clearly named and use minimum 44px tap targets. Existing action handlers are unchanged.
- Preserve the team customization button and pending-claim indicator.

### 4. Team player groups
- Individual bordered cards for Starters, Bench, IR, Taxi, and Draft Picks, with recognizable section headers and counts.
- Starter rows retain authentic NHL photos (now a more legible 36px), NHL matchup/schedule, player nickname, injury tags, roster slot editing and player detail.
- Add persistent score headers: **Actual · Proj. FPTS**. Row actual and projected numbers are labeled and use tabular figures.
- Empty slots remain available to fill. Disabled/invalid roster placements remain visibly flagged. The team's configured taxi maximum NHL games remains displayed; taxi rows now reuse `PlayerItem` instead of a separate portrait layout with a fixed `0.00`.
- Lineup warning boxes are more legible and offer a **Review starters** scroll action. This is navigation only, not a roster transaction. Week lock messaging remains in place.

## No regression requirements
- Preserve every real NHL player portrait and the fallbacks, including the full Team roster and opponent matchup rows.
- Keep gameplay actions and the same Match, Team, Players, League navigation structure.
- Keep the Phase 0 Preview `SAMPLE DATA · READ ONLY` banner and block writes.
- No Prisma schema/migrations or hockey scoring formulas modified.
- Keep phone shell at 430px maximum and support 320px width.

## QA and review procedure
`visual/phase-04.spec.ts` checks Team and Match at **320, 375, 390, 430px**. It captures separate screenshots of both screens at all four widths, checks document overflow, portrait image URLs, per-row 44px edit actions, accurate score labeling, repeated Trade navigation, Schedule drawer, and the player-details dialog. It runs alongside the inherited Phase 0–3, reduced-motion, and no-database checks.

CI: `npx tsc --noEmit`, `npm run test:visual`, `npm run test:preview`, `npm run test:production-no-db`, `npm run build`.

After CI completes, review the attached images and HTML report and check side-by-side against Phase 3. If Vercel Hobby preview builds are still rate-limited, GitHub Actions artifacts are authoritative for what was rendered. No live preview URL is claimed until Vercel confirms one.

## Release gate
- [ ] CI passes TypeScript, baseline, preview tests, production-no-DB tests and build.
- [ ] Match shows real, readable actual and projected fantasy points—not win-percent guesses.
- [ ] Match comparison retains actual NHL portraits on both sides, plus scores and interaction controls.
- [ ] Team list remains visible at 320px with text, portrait and actual/proj values.
- [ ] Roster position, Schedule and Trade actions still open the existing workflows.
- [ ] No lost last rows or horizontal overflow at any target width.
- [ ] New visual designs explicitly approved by owner.
- [ ] Phase 0, 1, 2, 3 merged in sequence before merging this draft PR.
