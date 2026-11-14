<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install dependencies with `npm ci`. The `postinstall` script runs `prisma generate`.
- NEVER assume the default `DATABASE_URL` is disposable: it may resolve to a hosted Neon league. Export `DATABASE_URL=postgresql://johnscott:johnscott@127.0.0.1:5432/johnscott` and verify the database before Prisma commands. Do not commit database credentials or use a shared production database for testing.
- Versioned migrations are available in `prisma/migrations`. Use `npx prisma migrate deploy` to initialize a disposable empty database. For older databases made with `prisma db push`, reconcile schema and migration history first; never blindly run the baseline against populated tables. Seeding requires `SEED_EMPTY_LEAGUE=YES_I_HAVE_VERIFIED_THE_DATABASE npm run prisma:seed` and refuses production or ANY existing league/manager/roster/draft state. Never run this against hosted production.
- Dev server: `npm run dev` (port 3000). Open `http://localhost:3000`. Next.js blocks dev assets when the page is opened as `127.0.0.1`, so the PIN gate will not hydrate on that host. There is no lint script. Typecheck with `npx tsc --noEmit`. End-to-end tests: `TEST_DATABASE_URL=postgresql://johnscott:johnscott@127.0.0.1:5432/johnscott_e2e npm run test:e2e` (Playwright, Chromium). Initialize that local disposable database separately; never use a shared database or running server.
- `npm run build` never fetches NHL registry data. Use `npm run sync-players` only for intentional, reviewed registry updates.
- Seeded managers sign in with PIN `1234`. The e2e setup chooses Montreal Monarchs.

## Design system (mandatory for UI changes)

- Read [DESIGN.md](DESIGN.md) before adding or changing a UI element. Semantic tokens originate in `app/globals.css` and map into Tailwind v4 `@theme inline`. Prefer them over new literal colors.
- **Do not remove real NHL player portraits or replace them with icons/initials.** Reuse `PlayerPortrait` and `getPlayerPhoto()`, preserving source URL, crop and broken-image behavior. Keep position indicators *alongside* headshots.
- Shared controls are `components/ui/button.tsx`, `tabs.tsx`, `badge.tsx`, `sheet.tsx`, `dialog.tsx`, and `hockey.tsx`. Main actions should provide a 44×44px touch target, accessible focus and labels.
- Respect the mobile 430px shell, 320px minimum test width, safe areas, reduced motion and data density. Never present projected fantasy points as actual points.
- View the real components at `/ui-design-system` in development fixture mode or a Vercel PR Preview, **never on the production domain**.
- Pull requests for the phased redesign are stacked, separately reviewed, and must not be merged to `main` without explicit approval. Use `npm run test:preview` and `npm run test:visual` for read-only screenshot regression; the normal E2E suite requires a disposable local PostgreSQL test database.
