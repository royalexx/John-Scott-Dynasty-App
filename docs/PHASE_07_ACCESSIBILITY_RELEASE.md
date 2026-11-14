# Phase 7 — Final UI accessibility, responsive, motion and regression gate

**Stacked base:** `ui/phase-06-workflows` (Phase 6 draft PR #44).  
**Design direction:** preserve Phase 3's simpler Match/Team structure, Phase 5's compact Players/League lists and Phase 6's transaction flows. **Do not reuse or merge rejected Phase 4 PR #37.** All NHL player portraits remain genuine, loaded by `PlayerPortrait`/`getPlayerPhoto`.

## Objectives and scope

Phase 7 is a quality and release-readiness review. It does not redesign screens or change game behavior. Its changes correct accessibility gaps uncovered while writing additional functional tests, and create repeatable regression evidence for future development.

### 1. Keyboard and screen-reader usability

- The manager PIN keypad accepts physical number keys **0–9**, and Backspace, while focus is in the PIN panel. A fourth digit retains the existing login flow; tests intentionally stop before submission.
- Focus moves to the PIN panel on team selection. The progress indicator announces the *count* entered (never the confidential digits); incorrect PIN errors use `role=alert`.
- Direct messages have labeled Search and Compose inputs, at least 44×44px close/back/send controls, and a semantically named message log. The existing message API and receipt behavior are unchanged.
- Player-grid settings filters identify groups and pressed choices to assistive technology. Close/filter buttons have 44px minimum hit areas. A preview-only fixture tests this component; it does not mutate persistent settings.
- Loading and unexpected-error views use the existing semantic contrast tokens and announce status/errors, with a keyboard-visible Retry button.

### 2. Motion, contrast, mobile and focus

- Direct-message auto-scroll respects `prefers-reduced-motion` rather than forcing smooth scrolling.
- Retain CSS reduced-motion rules, keyboard focus rings and the Phase 3 swipe navigation, and protect existing safe-area behavior.
- Recheck selected foreground/background token pairs at >=4.5:1 in the browser for normal text. This **does not** imply an exhaustive WCAG certification of every historical pixel.
- Verify no horizontal page overflow at 320px, 375px, 390px and 430px (existing suites); test 1280px phone-width shell through inherited baseline tests.
- Preserve original 32–40px list and 64–80px detail NHL portrait sources. Do not replace with emojis or initials except existing genuine image-failure fallback.

### 3. Real measurements and evidence

The read-only Phase 7 preview tests record JSON measurements for Match, Team, Players and League at 320px, 390px and 430px: document width, shell width, element count, request count, navigation DOMContentLoaded and first contentful paint. Measurements are review artifacts, **not assertions of faster performance or a synthetic page-speed score**; improvements require comparison under matched conditions.

Playwright also captures keyboard/focus, settings, PIN and direct-message screenshots. The PIN tests run only in the explicitly enabled local visual fixture; the PWA/login fixture stays inaccessible to Vercel Production.

### 4. Safety and release conditions

- [ ] `npx tsc --noEmit` completes
- [ ] `node scripts/verify-e2e-guard.mjs` passes and no real database is accessed by visual tests
- [ ] `npm run test:visual` passes (including the keyboard PIN fixture)
- [ ] `npm run test:preview` passes (including Phase 7)
- [ ] `npm run test:production-no-db` passes (no fictional league data on production)
- [ ] `npm run build` passes
- [ ] Full CI screenshot/metric/trace artifacts uploaded and reviewed
- [ ] No new horizontal overflow or focus trap, and portrait URLs preserved
- [ ] User explicitly approves merge after earlier stacked PRs; **do not merge automatically**

No Prisma schema or migration, hockey-scoring or business rule changes, backend endpoint changes, or data writes are in scope. No hosted Vercel Preview should be claimed until its deployment status is successful; Hobby build limits have previously blocked Preview despite successful GitHub Actions builds.

## Out-of-scope and follow-up

A complete WCAG 2.2 AA conformance claim requires a full assistive-technology/manual screen-by-screen audit in addition to automated checks. Production performance tuning needs authenticated, representative league data and consistent device/network measurements. The current read-only fixture provides **structural and regression assurance**, not production traffic timing.

## Review

PR remains **draft** on top of Phase 6 until the owner reviews. If changes are rejected, closing this PR leaves Phase 6 and `main` unchanged.
