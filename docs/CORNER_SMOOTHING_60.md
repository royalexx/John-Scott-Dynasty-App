# Global 60% corner smoothing

**Scope:** John Scott Dynasty's accepted Phase 14 draft release UI, with the original pre-Phase-11 Match tab. **Branch:** `ui/corner-smoothing-60`. This is a visual-only enhancement; it does not change the server, Prisma schema, authentication, scoring, session rules or Vercel production settings.

## Implementation

- `app/globals.css` defines the design parameter `--ds-corner-smoothing: 0.6` (Figma's iOS-style 60% setting).
- The native CSS equivalent uses the `corner-shape: superellipse(1.777468)` curve. Based on the compensated radius mapping at smoothing `s = 0.6`:
  - radius extension `r × (1 + s) = 1.6r`;
  - `u = 1 - (1 - 1/√2) / 1.6`;
  - superellipse exponent `n = ln(2)/ln(1/u)`;
  - CSS `K = log2(n) ≈ 1.777468`.
- The global, zero-specificity `:where(*, *::before, *::after)` selector applies this curve to all components that **already have nonzero rounded corners**. Sharp rectangles remain sharp.
- Shared radius design tokens (`--ds-radius-sm/md/lg/xl`) are compensated by `×1.6` to retain the intended perceived size in supported browsers. Explicit arbitrary utility/inline radii keep their original numeric radius but gain the same continuous superellipse shape. These cannot always exactly reproduce Figma's smoothing geometry without per-element size/radius inspection.
- `.rounded-full` circles/pills and `[data-slot="player-portrait"]` are deliberately excluded from the new shape to prevent circular NHL headshots, team avatars and pill buttons from turning into rounded squares. Existing colors, card spacing, height, width and font sizes are unmodified.
- `@supports (corner-shape: superellipse(1.777468))` gates the enhancement. Chromium/Edge 139+ use the continuous shape natively. On unsupported Firefox/Safari/iOS Safari builds, existing `border-radius` values remain in effect. **Do not** use masks, SVG clipping or dynamic ResizeObservers globally: that would risk shadows, keyboard focus outlines, interactive overlays and performance.

## Validation

`visual/corner-smoothing-60.spec.ts` runs at 320px, 390px and 430px and checks:
- all four tabs continue to show an already-rounded component with a computed superellipse shape;
- standard shared corner radius tokens reflect the compensated 60% setting;
- circular/pill elements and genuine NHL portraits retain a `round` shape;
- custom arbitrary radii keep independent numeric values, including square corners;
- no horizontal page overflow, no API mutations and screenshot attachments from the Team tab.

The full existing read-only visual, preview, production-fail-closed, disposable-PostgreSQL and authentication suites remain required for this draft PR.

**Review before merging:** this style change is intentionally visible and should be approved in the separate Vercel Preview. The Phase 14 release remains draft/blocked until hosted database and owner-approval requirements are met.

## References

- Figma: https://help.figma.com/hc/en-us/articles/360050986854-Adjust-corner-radius-and-smoothing — iOS preset 60%.
- Native property: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/corner-shape
- Smoothing-to-superellipse mapping: https://lixiaolin94.github.io/smooth-corners-web/
