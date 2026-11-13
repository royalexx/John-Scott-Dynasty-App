# John Scott Dynasty — Phased UI/UX Modernization Roadmap

**Status:** Planning only. No application code changed by this roadmap.
**Baseline:** `main` as reviewed on 2026-11-13.
**Product constraint:** Mobile-first fantasy hockey, `max-w-[430px]` application shell.
**Reference:** [Griffin Wooldridge — How to Make AI-Generated UI Look Expensive (7 Fixes)](https://youtu.be/eQ74n4huAcA).

## Non-negotiable design and safety constraints

1. **Preserve real NHL player portraits on every surface that already shows them**: roster, free agents, search, leaders where applicable, player details, lineup selection, waiver, trade, and draft flows. Do not replace player headshots with generic initials or icons. Keep the current image sources and error fallbacks; standardize image sizing, cropping, and layout without removing imagery. Suggested row portraits: 32–40px; detail portraits: 64–80px.
2. Preserve team logos, positional badges, and meaningful injury indicators. Remove the leftover third-party Sleeper watermark without stripping useful identity.
3. Do **not** change scoring, waiver settlement, trade rules, roster eligibility, weekly locks, NHL sync, or Prisma schema as collateral to UI work. A confirmed domain bug requires a separate reviewed change.
4. **No phase merges directly to `main`.** Each implementation phase uses a named feature branch and a GitHub PR with before/after screenshots, a test summary, the deployment preview URL if actually available, and a rollback path. Do not merge without the user's explicit review and approval.
5. **Never test destructive roster, waiver, trade, or commissioner flows on production/shared Neon data.** Use an isolated seeded local/preview PostgreSQL database and mock irreversible transactions where needed.
6. Keep mobile swipe navigation, reduced-motion support, and the existing full-featured fantasy-hockey data density.
7. Do not claim that pushing a branch guarantees a live preview. Verify Vercel/hosting PR preview integration and environment separation in Phase 0; if absent, add/confirm preview infrastructure before asking for visual approval.

## Delivery and preview policy — used by every phase

- Branch naming: `ui/phase-00-baseline-preview`, `ui/phase-01-ux-corrections`, `ui/phase-02-design-system`, `ui/phase-03-shell`, `ui/phase-04-match-team`, `ui/phase-05-players-league`, `ui/phase-06-transactions`, `ui/phase-07-validation`.
- Open each PR in **draft** as soon as the implementation diff is ready; push every incremental change to the branch, never directly to `main`.
- Each PR body must contain: objective, exact files changed, behavioral changes, explicit portrait-preservation check, test evidence, 320/375/390/430px before/after screenshots, data-environment check, actual preview URL (only if verified), and known limitations.
- If Vercel preview deployments are connected, use the preview URL from the PR checks and an **isolated preview database**. If no live preview exists, do not invent a URL or call the PR a working UI preview: provide screenshots/artifacts and first provision or connect an actual preview environment.
- Preview jobs must not have production write credentials or trigger production sync/waiver cron behavior. Verify secret-scoping and authentication. Demonstrate final states with seeded or mocked data, not live fantasy rosters.
- After a phase is reviewed, update the branch to address comments, rerun checks, and merge **only after approval**. Proceed to the next phase from the newly accepted baseline. Any failed quality gate blocks the merge.
- Preserve an identifiable revert commit/PR route per phase; do not bundle unrelated phases into a single hard-to-revert PR.

## Phase 0 — Baseline, test safety, and preview verification

**Goal:** Make the existing app reproducible and reviewable without modifying league data.

**Tasks**
- Check the open seed-fix PR (#8) against `main`; resolve the local seed setup prerequisite separately, without implicitly merging that PR as part of UI work.
- Establish isolated local PostgreSQL / disposable Neon preview database; seed 12 teams only in the isolated database. Prevent tests from mutating shared data.
- Verify whether a PR creates a real hosted preview, and whether it is authenticated and uses preview-only environment variables. A `vercel.json` file alone does not confirm previews.
- Capture current authenticated Match, Team, Players, League, player detail, trade, waiver, chat, and PIN views at 320, 375, 390, and 430px; include 1280px shell constraint and full-page long content. Include a separate portrait-visibility baseline.
- Record current passing and failing checks: `npx tsc --noEmit`, `npm run build`, `npm run test:e2e`; do not treat historical audit pass claims as current verification.
- Set up automated screenshot comparison, basic accessibility checks, and test fixtures for loading, empty, locked, injured, draft, and server-error states.

**Key files:** `playwright.config.ts`, `e2e/`, CI config and preview deployment settings only as needed.
**Acceptance gate:** Isolated tests cannot touch production; screenshots are captured; preview status is honestly documented; baseline failures enumerated; `main` unchanged.

## Phase 1 — Interaction correctness and trustworthy data display

**Goal:** Repair UX faults without a broad visual overhaul.

**Tasks**
- Fix Team > Trade navigation: selecting trade must activate the Trade subtab even after Players has already mounted.
- Replace misleading win-probability displays derived from projected-point shares or unvalidated logistic transforms. Clearly differentiate **actual points**, **projected final points**, and true win probability (only if a calibrated model is available).
- Fix weekly podium comparisons to use a consistent metric across all teams, explicitly labeled **actual** or **projected**.
- On database errors, show an actionable unavailable/retry state instead of silently rendering mock league data as live data. Preserve explicit dev/demo mode only when intentionally selected.
- Remove invalid nested interactive elements in draft queue rows and trade asset controls; ensure keyboard activation toggles exactly once.
- Give score columns, FPTS sort values, action buttons, and injury states explicit accessible labels.
- Check and fix bottom overlay clearance on every scrollable tab, including chat preview and inset-safe areas.

**Key files:** `app/page.tsx`, `app/dashboard-client.tsx`, `components/hockey/matchup-banner.tsx`, `components/hockey/league-feed.tsx`, `components/hockey/players-market-view.tsx`, `components/hockey/draft-room.tsx`, `components/hockey/trade-builder-dialog.tsx`.
**Acceptance gate:** Deep navigation reaches its intended tab; no actual/projection ambiguity; keyboard and touch tests pass; no real transactions from test runs; portraits untouched.

## Phase 2 — Unified design system

**Goal:** Replace ad hoc styling with shared rules before redesigning individual screens.

**Tasks**
- Establish semantic colors: background, surface, elevated surface, border, primary text, secondary text, disabled, accent, error, warning, and success. Retain restrained cyan as brand accent and semantic hockey position colors.
- Define the spacing scale `4/8/12/16/24/32` px, 16px main gutters, 16–20px card padding, 24px section rhythm, and at least 44x44px touch areas for key interactive controls.
- Define text hierarchy: title 22–26px, heading 17–18px, body 14–16px, metadata 12–13px; audit actual contrast rather than blindly applying colors.
- Consolidate button, tabs, status badge, cards, input, drawer/sheet, list row, and portrait/avatar patterns. Do not globally grow high-density table-like content without context.
- Add documented focus-visible styles and motion/reduced-motion standards. Preserve swipe animation and keep decorative effects sparse.
- Create `DESIGN.md`, and reference it in `AGENTS.md` and `.cursorrules` so subsequent AI edits follow the same UI decisions.
- Preserve existing `PlayerPortrait`, `PlayerRow`, and image sources, standardize crop and fallback behavior, and test for image regressions.

**Key files:** `app/globals.css`, `components/ui/`, `components/hockey/player-portrait.tsx`, `components/hockey/player-item.tsx`, `DESIGN.md`, `AGENTS.md`, `.cursorrules`.
**Acceptance gate:** Token reference and component examples reviewed in PR; visible keyboard focus; normal-text contrast verified; portraits retained; visual diff identifies intentional global changes only.

## Phase 3 — Main shell, navigation, and overlays

**Goal:** Give every tab consistent spacing and navigation behavior.

**Tasks**
- Standardize header, top-level tabs, selected states, heading hierarchy, scroll containers, safe-area insets, and interactive hit areas.
- Retain the current four main tabs and swipe semantics unless a separate preview supports changing navigation location.
- Reserve chat overlay clearance in every tab or make its footprint context-aware. Prevent floating controls from masking list actions.
- Harmonize shared sheets and modals, sticky action footers, scroll containment, keyboard focus return, and keyboard appearance.
- Keep the max-width 430px app shell and test narrow phones explicitly.
- Make team identities and real NHL imagery first-class, without gratuitous glowing effects.

**Key files:** `app/dashboard-client.tsx`, `app/layout.tsx`, `app/globals.css`, `components/ui/sheet.tsx`, `components/hockey/swipe-gestures.tsx`, `components/hockey/league-chat-drawer.tsx`.
**Acceptance gate:** Four tabs navigate by tap/swipe and keyboard; no hidden last row; portrait and team imagery unaffected; narrow phone screenshots reviewed.

## Phase 4 — Match + Team redesign

**Goal:** Make weekly competition and lineup decisions the visual focal points.

**Match changes**
- Scoreboard first: team identity, actual scores, live/final status, and separately labeled projected final scores.
- Clarify matchup switching and previous/next weeks; preserve starter-by-starter comparison and clickable player portraits.
- Simplify repeated borders, tighten metadata labels, and keep the score visually dominant.

**Team changes**
- Compact team identity and standings summary; clear labels for PF, PA, FAAB, and points columns.
- Convert lineup health findings into direct access to the affected lineup slots where feasible.
- Group starters, bench, taxi, IR, and picks with distinct but consistent section rhythm. Preserve player portraits at every applicable roster row.
- Preserve roster locking, eligibility, and legal swap controls exactly.

**Key files:** `components/hockey/matchup-panel.tsx`, `components/hockey/matchup-banner.tsx`, `components/hockey/team-header.tsx`, `components/hockey/player-item.tsx`, `components/hockey/lineup-alerts.tsx`, `app/dashboard-client.tsx`.
**Acceptance gate:** Matched before/after captures for Match and Team; no scoring or roster-rule differences; all displayed players retain headshots; lock-related tests pass.

## Phase 5 — Players + League redesign

**Goal:** Make discovery and league context readable and action-oriented.

**Players changes**
- Search-first navigation, explicit current metric/time horizon, visible column labels, filter hierarchy, larger hit areas for Add/Claim.
- Keep NHL headshots in available-player, search, and relevant leaderboard views. Preserve source URLs and fallback behavior.
- Provide proper empty, loading, and paginated list states. Keep player-market sorting calculations unchanged except demonstrated UX bugs.

**League changes**
- Prioritize current league matchups, standings, and activity; contextualize draft cards and weekly awards.
- Use consistent and labeled projected/actual data for leaderboard and weekly podium.
- Preserve playoff bracket, manager tools, and activity details; maintain readable team identities.

**Key files:** `components/hockey/players-market-view.tsx`, `components/hockey/players-sub-tab-view.tsx`, `components/hockey/league-feed.tsx`, `components/hockey/player-portrait.tsx`.
**Acceptance gate:** Filters/sorts/links remain functional; no duplicate/vanished players; portrait coverage verified; league totals intact.

## Phase 6 — Transactional, secondary, and admin screens

**Goal:** Make consequential actions understandable and safe.

**Tasks**
- Player detail: consistent headshot, status, primary statistics, game logs and tab structure.
- Waivers: show balance, bid, drop requirement, and clear confirmation/feedback before submitting.
- Trade builder: distinct assets-to-send / assets-to-receive sections, visible selected state, confirmation, cancel and error paths.
- Roster swap: legal destinations and lock reasons; preserve transaction endpoints and rules.
- Draft: accessible player selection and queue, visible turn/timer, clear pick confirmation.
- Chat/DM: improved compose area, scrolling and submit failure feedback.
- PIN and commissioner settings: consistent fields, errors, touch areas, readable long forms; preserve authorization and settings semantics.
- Ensure portraits stay on trade, waiver, draft, player detail and roster operations; don't replace them with placeholders.

**Key files:** `components/hockey/player-detail-dialog.tsx`, `components/hockey/waiver-claim-dialog.tsx`, `components/hockey/trade-builder-dialog.tsx`, `components/hockey/lineup-slot-dialog.tsx`, `components/hockey/draft-room.tsx`, `components/hockey/direct-messages-dialog.tsx`, `components/hockey/commissioner-settings-dialog.tsx`, `components/auth/pin-gate.tsx`.
**Acceptance gate:** End-to-end happy and error cases pass on isolated data; transaction payloads and rules remain unchanged; portrait visibility verified.

## Phase 7 — Accessibility, regression, performance, and release

**Goal:** Turn the staged review into an auditable release.

**Tasks**
- Compare every changed page at widths 320, 375, 390, 430px, plus the 1280px shell constraint and representative screen heights.
- Verify contrast against applicable WCAG 2.2 AA criteria, accessible labels, focus visibility, keyboard traps/return, zoom, reduced motion, and screen-reader-relevant state.
- Verify portrait rendering and source fallback with automated image-presence checks; test slower network and broken-image cases.
- Re-run TypeScript, build, Playwright regressions, relevant API tests, and real-data/display separation checks.
- Measure UI responsiveness and layout shift without changing the backend data model to chase superficial scores.
- Confirm only approved phase PRs have merged; produce a consolidated change log, evidence links and revert instructions.

**Acceptance gate:** No unexplained visual regressions, no functional regressions versus the isolated baseline, no production-database modifications from tests, previews reviewed and approved, no missing player portraits.

## Review and merge checklist for **every** PR

- [ ] Diff pushed to feature branch; direct modifications to `main` avoided.
- [ ] PR opened with links to before/after screenshots.
- [ ] Actual visual preview link verified, or explicitly noted as unavailable.
- [ ] Production database / secrets isolated from test and preview environments.
- [ ] NHL player portraits preserved wherever previously present.
- [ ] Tests run and results recorded, including any known preexisting failures.
- [ ] Scope matches this phase; no accidental hockey-rule or scoring changes.
- [ ] User reviewed the change and explicitly approved merge.
- [ ] Revert strategy available.

**Important:** The present repository's `main` branch was reported as unprotected on 2026-11-13. This roadmap defines a mandatory review process but does not technically enforce branch protection. Configure GitHub repository rulesets and verified preview deployments separately; do not imply either is already active.
