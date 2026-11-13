# Phase 1 — UX Reliability and Data Trust

**Review state:** Changes are proposed on `ui/phase-01-ux-corrections` and have **not** been merged.  
**Base:** `ui/phase-00-baseline-preview` (draft PR #14).  
**PR:** [Phase 1 PR #25](https://github.com/royalexx/John-Scott-Dynasty-App/pull/25).  
**Production:** `main` and `johnscottdynasty.live` are unchanged.

## Non-negotiable requirements

- Preserve genuine NHL player portraits, headshot URLs, photo sizing, and image fallbacks across the existing UI.
- Do not alter league scoring formulas, roster and taxi eligibility, trade/waiver processing, draft ownership, or Prisma schema/migrations.
- Do not assert that Prisma itself stores data: Prisma is the ORM; `DATABASE_URL` must connect to PostgreSQL for persistence.
- All changes are pushed to the Phase 1 branch for inspection **before** any production merge.
- Phase 1 must be reviewed and approved separately from Phase 0. It is stacked on Phase 0 so its diff contains only Phase 1 changes.

## Implemented

### 1. Reliable contextual Trade navigation
Files: `app/dashboard-client.tsx`, `components/hockey/players-market-view.tsx`.

Repeated clicks on Team > Trade now increment an explicit navigation request. The Players view responds to each request even after its local state was changed to Search, Available, or Leaders. The Available heading no longer incorrectly says "Trade Center". Subtab selection exposes `aria-pressed`.

### 2. Trustworthy Match and League numbers
Files: `components/hockey/matchup-banner.tsx`, `components/hockey/league-feed.tsx`.

Removed misleading win-percentages derived from projected-point shares and an arbitrary logistic transform. No calibrated probability model was present, so these are **not** valid win probabilities. Actual point totals remain separate from the explicitly named projected totals.

The Weekly Podium now uses one metric across **all** teams: actual points when that week has begun, projected points when all matchups remain scheduled. The section title and each score are marked "Actual" or "Projected". The Matchup Sheet likewise no longer shows fabricated `% WIN` fields.

### 3. Explicit Prisma/database errors
Files: `app/page.tsx`, `app/dashboard-client.tsx`, `components/hockey/league-unavailable.tsx`.

The production app no longer falls back to simulated example rosters when its database query fails or the requested league is absent. It shows an accessible "League data unavailable" message with retry instead. If a real team has zero roster players, standings, draft picks, or activities, those collections remain genuinely empty.

The Phase 0 **Vercel Preview** sample data remains supported and prominently labeled `UI PREVIEW · SAMPLE DATA · READ ONLY`, with transaction writes blocked by Phase 0's proxy. A sample screenshot is not evidence of league persistence.

**Important deployment behavior:** Since the owner reported no Vercel environment variables, storage or integrations, a future approved deployment may show the unavailable page instead of a sample league until PostgreSQL and relevant secrets are properly connected. This is intentional; production data must never be fabricated.

### 4. Accessible, independent controls
Files: `components/hockey/draft-room.tsx`, `components/hockey/trade-builder-dialog.tsx`, `components/hockey/players-market-view.tsx`, `app/dashboard-client.tsx`.

Draft player selection and queue actions are now separate native buttons with keyboard focus and pressed states. Trade player rows use an actual labeled checkbox and a separate portrait-based player-details button instead of nested simulated interactive controls. The key Add/Claim target in Players is at least 44×44px. The Starters heading is no longer an inoperative button. Market values are explicitly labeled by metric, time window, and projection/actual mode.

### 5. Persistent chat clearance
Files: `app/dashboard-client.tsx`, `components/hockey/matchup-panel.tsx`, `components/hockey/league-feed.tsx`.

Additional bottom scroll clearance keeps the floating chat preview from covering the final rows in Match, Team, Players, or League. The chat affordance has a 44px minimum tap height.

## Tests

- `npm run test:visual`: Baseline screen snapshots for Match, Team, Players, and League at 320/375/390/430px, plus a 1280px shell and secondary screens; checks player portrait source presence.
- `npm run test:preview`: Phase 0 read-only preview checks plus Phase 1 repeated Trade navigation, score-label, player portraits, action sizing, and keyboard-operated draft queue checks.
- `npm run test:production-no-db`: Starts Next.js locally with production-like `VERCEL_ENV` but **no database**, asserts that live league information is never substituted by static example data.
- `npx tsc --noEmit`: TypeScript source and test tooling.
- `npm run build`: Production build (runs only on CI/developer environment; no persistent database is involved).
- The full mutating `npm run test:e2e` suite is not included: it is gated by Phase 0's isolated local PostgreSQL rules. Never point it at production Neon.

The GitHub Actions **UI visual baseline (read-only)** workflow runs these safe checks and uploads screenshot and HTML test artifacts. A successful GitHub build is separate from Vercel's Hobby-plan deployment quotas.

## Manual review checklist

- [ ] On the Preview, visit Team > Trade, navigate back to Available, then Team > Trade again; each attempt opens Offers.
- [ ] Match score shows actual points, a labeled projected-points line, and no uncalibrated win %.
- [ ] League Weekly Podium compares the same metric across teams, with an explicit label.
- [ ] League matchup cards and detailed matchup sheets no longer show `% WIN`.
- [ ] Search and Available market modes retain filters and selected tab indicators; FPTS values have clear labels.
- [ ] Player portraits still appear on Team and trade player rows; portrait navigation opens player details.
- [ ] Draft queue and player selection are separate keyboard-operable controls; toggling queue does not arm a pick.
- [ ] The floating chat preview does not cover final content on any of the four tabs.
- [ ] A production-like deployment without PostgreSQL displays the "League data unavailable" message—not example hockey results.
- [ ] No Prisma migrations, hockey-domain formulas or transaction endpoints have changed.
- [ ] Vercel's actual preview URL is reviewed if the Hobby build limit permits; otherwise review the screenshot artifact and PR diff.
- [ ] Owner explicitly approves any merge; Phase 0 must be accepted first.

## Rollback

Phase 1 is a discrete set of commits on `ui/phase-01-ux-corrections`; it can be closed without touching production. If merged and later rejected, revert the merge commit rather than modifying scoring or database state. The baseline is the separately reviewed Phase 0 branch.
