<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install dependencies with `npm ci`. The `postinstall` script runs `prisma generate`.
- NEVER assume the default `DATABASE_URL` is disposable: it may resolve to a hosted Neon league. Export `DATABASE_URL=postgresql://johnscott:johnscott@127.0.0.1:5432/johnscott` and verify the database before Prisma commands. Do not commit database credentials or use a shared production database for testing.
- There are no Prisma migrations yet. Use `npx prisma db push` only for disposable development databases. Seeding requires `SEED_EMPTY_LEAGUE=YES_I_HAVE_VERIFIED_THE_DATABASE npm run prisma:seed` and refuses production or ANY existing league/manager/roster/draft state. Never run this against hosted production.
- Dev server: `npm run dev` (port 3000). Open `http://localhost:3000`. Next.js blocks dev assets when the page is opened as `127.0.0.1`, so the PIN gate will not hydrate on that host. There is no lint script. Typecheck with `npx tsc --noEmit`. End-to-end tests: `npm run test:e2e` (Playwright, Chromium).
- `npm run build` runs `prebuild`, which fetches NHL data and rewrites `public/data/nhl-players.json`.
- Seeded managers sign in with PIN `1234`. The e2e setup chooses Montreal Monarchs.
