# Phase 10 — League navigation and activity filtering UX

**Branch:** `ui/phase-10-league-navigation-and-filters`, stacked on Phase 9 draft PR #48.
**Scope:** small improvements to the existing compact League tab, not a structural redesign.

## Changes
- League matchup week navigation observes the existing `MAX_FANTASY_WEEK` (24). Previous/Next and swipe have the same boundaries. Disabled arrows remain visible, with 44px tap targets and announced week status.
- Manager checkboxes in the league transaction filter now actually filter activity by the selected owners. The `null` state means all managers; zero selected correctly displays an empty result.
- Type and manager filters can be combined. Selections have accessible pressed/checked states, a clear Select all action, and a Show activity button.
- Filtered-empty activity has an explicit message rather than a silent blank feed.
- A read-only Playwright suite tests week 1 and 24 boundaries, 44px controls, manager filtering/reset, lack of horizontal overflow and no mutating API requests at 320px and 390px.

## Preserved behavior
- Match, Team, Players and League retain their approved structures. NHL player portraits are unchanged, including activity cards.
- No changes to hockey scoring, rankings, transaction execution, schemas/migrations, Prisma, NHL sync, team PINs or database credentials.
- Preview testing explicitly uses no database. No remote PostgreSQL reads or writes occur in these checks.

## Release safety
- Draft PR only. No merge into `main` or deployment to the live domain without explicit review.
- Phase 8's requirement to verify distinct Preview and Production databases remains open.
