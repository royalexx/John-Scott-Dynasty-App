<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

- Install dependencies with `npm ci`. The `postinstall` script runs `prisma generate`.
- The committed `.env` `DATABASE_URL` points at a hosted Neon database. Use local PostgreSQL for development so commands do not write to that hosted database. Export `DATABASE_URL=postgresql://johnscott:johnscott@127.0.0.1:5432/johnscott` before Prisma or `next dev`. A variable already set in the environment overrides `.env`.
- There are no Prisma migration files. Sync the schema with `npx prisma db push`. Seed with `npm run prisma:seed` only when `"League"` is empty. Seeding replaces roster slots.
- Dev server: `npm run dev` (port 3000, hostname `0.0.0.0`). There is no lint script. Typecheck with `npx tsc --noEmit`. End-to-end tests: `npm run test:e2e` (Playwright, Chromium).
- `npm run build` runs `prebuild`, which fetches NHL data and rewrites `public/data/nhl-players.json`.
- Seeded managers sign in with PIN `1234`. The e2e setup chooses Montreal Monarchs.
