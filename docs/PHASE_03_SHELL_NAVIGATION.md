# Phase 3 — App shell, navigation and bottom sheets

**Branch:** `ui/phase-03-navigation-shell`  
**Base:** `ui/phase-02-design-system`, draft PR #34  
**Status:** Review-only implementation. No production merges or database migrations.

## Product intent

Keep the existing four tabs (Match, Team, Players, League), the 430px phone-width application shell, native swipe gestures, NHL portraits, and hockey-domain interactions. Phase 3 refines the **shared frame**, not the content design that belongs to Phases 4–6.

### Main shell

- Standardized the main shell and header to Phase 2's semantic `background`, `surface`, `border`, `foreground`, `text-secondary`, and `brand` tokens.
- Preserved the `max-w-[430px]` limit, the `h-dvh` viewport, existing icon/league identity and unread DM indicator.
- Provided 44px touch targets for DM/settings controls and every main tab, with visible focus.
- Preserved button-based primary navigation and existing `SwipePager`. Buttons use `aria-pressed` to identify the selected destination; ArrowLeft/ArrowRight switch tabs and follow keyboard focus while keeping the screen reader announcement accurate.
- Removed the ornamental third-party `sleeper` watermark from the Team content, not the NHL or fantasy identity.

### Chat dock: no overlapping data

- Moved the global chat preview from an `absolute` floating element into its **own in-flow flex row** under the SwipePager. This protects the last lineup, market, and league rows at narrow heights and when the device orientation changes.
- Removed obsolete large bottom spacers from Team, Players, Match and League, replacing them with a normal content gutter.
- Kept the chat preview on all four tabs, without introducing a fifth primary navigation tab. Chat opens the existing bottom sheet as before.

### iOS safe-area handling

- The old implementation applied safe-area padding on both the document body and its layout classes while the main phone shell independently used `h-dvh`. This could force the page beyond the visual viewport.
- Now the `h-dvh` main shell owns `env(safe-area-inset-top)` and `env(safe-area-inset-bottom)` exactly once; body padding is zero.
- Bottom sheets receive a maximum height that does not exceed the dynamic visual viewport minus top safe inset. The chat form itself includes padding for the iOS home indicator.
- The existing PWA viewport metadata and general `safe-top`/`safe-bottom` utilities are retained for compatible secondary flows.

### Chat sheet behavior

- Standardized surfaces, text and controls using the Phase 2 design system.
- Chat header close button and send button have 44x44px touch targets, and the input has a 44px minimum height with an explicit accessible label.
- New messages scroll the chat feed to the bottom, including when asynchronously loaded.
- Sending failures show an actionable error and **preserve unsent draft text** instead of clearing it prematurely.
- A database-free Vercel Preview clearly explains that chat is **read only** and disables the composer; the HTTP write barrier from Phase 0 is still enforced.
- Closing via Escape uses Base UI's dialog focus behavior. All backend endpoints, authentication and chat payloads remain unchanged.

## Preservation requirements

1. **NHL player photos:** unchanged actual URLs, `getPlayerPhoto`, cropping, fallback and roster presentation. No position-only replacement.
2. **League semantics:** no scoring, transaction, waiver, draft, roster-locking or Prisma changes.
3. **Navigation:** same four tabs and SwipePager swipe actions, no replacement routing or novel navigation model.
4. **Data integrity:** production Prisma failures still show the explicit unavailable state from Phase 1. Development/demo content remains labeled and read-only.
5. **Readability:** preserve existing detailed roster and matchup information; don't introduce a generic dashboard layout.

## Validation

On PR CI, run `npx tsc --noEmit`, `npm run test:visual`, `npm run test:preview`, `npm run test:production-no-db`, and `npm run build`. Full mutation-capable E2E remains gated to a disposable local PostgreSQL database.

New `visual/phase-03.spec.ts` records screenshots of all four tabs at **320, 375, 390, 430px** and asserts: no document horizontal overflow; app width <=430px; nav and header remain visible; chat dock starts below the pager and stays above the shell bottom; body safe-area padding is not doubled; each tab's selected state is accurate. Other cases cover keyboard ArrowLeft/ArrowRight, chat drawer and Escape, disabled preview composer, 44px touch targets, real NHL player photo sources, and reduced-motion switching.

## User review / release gate

- [ ] GitHub PR draft has only Phase 3 diffs relative to Phase 2.
- [ ] GitHub CI passes and screenshot artifact is attached.
- [ ] Inspect header, tabs and in-flow chat dock at 320 / 375 / 390 / 430px.
- [ ] Review chat sheet at 320px and check keyboard dismissal.
- [ ] Verify the last row in each scrollable view is visible and unobstructed.
- [ ] Verify original player portraits remain in the Team roster.
- [ ] No Prisma schema, database write, or hockey rules changed.
- [ ] Review the next valid Vercel Preview URL **only if deployment is confirmed**; Hobby build-rate-limit errors do not indicate source build failure.
- [ ] Keep Phase 0, 1, 2 and 3 PRs draft/unmerged until explicit user approval, merging sequentially only after sign-off.

**Rollback:** Close the Phase 3 PR without affecting `main`, or revert its eventual merge separately.
