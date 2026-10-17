# John Scott Dynasty

Mobile fantasy hockey dashboard for one dynasty league. Managers sign in with a 4-digit PIN, set a weekly lineup, bid FAAB on waivers, trade players, picks, and FAAB, and follow head-to-head matchups scored from live NHL box scores.

The UI is a single page at `/`, locked to a phone-width shell (`max-w-[430px]`, `h-dvh`). Four tabs:

| Tab | What it shows |
| --- | --- |
| Match | This week's head-to-head, other league matchups, and the playoff bracket |
| Team | Starting lineup, bench, taxi, and IR |
| Players | Free agents, waiver claims, and the trade builder |
| League | Standings, activity, chat, and commissioner settings |

Use npm. This repo does not use pnpm or yarn.

## Stack

- Next.js 16 (App Router) and React 19
- PostgreSQL through Prisma 6 (`prisma/schema.prisma`)
- Tailwind CSS 4, Base UI, Lucide
- Playwright for end-to-end tests in `e2e/`

Import the database client from `@/lib/prisma`. Do not construct a new `PrismaClient` in routes or components. The seed script is the exception.

## Local setup

You need Node.js and a Postgres database (Neon works).

```bash
npm install
```

Create `.env` with:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
CRON_SECRET="any-long-random-string"
```

`DATABASE_URL` is required. `CRON_SECRET` is required only for the NHL sync and waiver cron routes.

There is no `prisma/migrations` folder. Push the schema, then seed the league:

```bash
npx prisma db push
npm run prisma:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Every seeded manager uses PIN `1234`. The commissioner account is **Montreal Monarchs** (`@commissioner`).

`npm install` runs `prisma generate`. `npm run build` also refreshes `public/data/nhl-players.json` from the NHL search API before `next build`, so a build needs network access.

If the league row is missing, the page falls back to the static roster in `lib/hockey-data.ts` instead of the database.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build and server |
| `npm run sync-players` | Rewrite the local NHL player registry |
| `npm run prisma:seed` | Upsert players, the league, 12 teams, the 24-week schedule, rosters, and 2027–2029 draft picks |
| `npm run test:e2e` | Playwright against `http://localhost:3000` |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npx tsc --noEmit` | Typecheck |

## League rules the code enforces

The seeded league id is `00000000-0000-0000-0000-000000000001`, name **John Scott Dynasty**, season `2026`.

**Weeks.** Fantasy weeks run Monday through Sunday in `America/New_York`. Week 1 of the 2026 season starts Monday 2026-09-28 (`lib/season-calendar.ts`). The season is 24 weeks. Unplayed games count as `0.0`. Do not substitute a weekly projection for a missing actual score.

**Roster.** Capacity is 27. Starting slots are C, W, F, D, and G, seeded as 3 / 6 / 3 / 6 / 2, plus 7 bench. Taxi holds players under 50 NHL games played (`taxiMaxGames`). IR accepts `PlayerStatus.IR` only. Day-to-day and IR+ (`O`) are not IR-eligible.

**Lineup lock.** Default mode is `WEEKLY`: starters freeze at the first puck drop of the fantasy week; bench, taxi, and IR stay movable. `DAILY` freezes a player once that NHL team's game today has started. A frozen week is copied into `WeekLineup` and later trades do not rewrite it.

**Waivers.** FAAB. A winning bid is deducted from `Team.faabBalance`. A drop is required only when the roster is already at 27. Claims process at Monday 00:00 Eastern after that week's NHL games are final. Outcomes are stored on `WaiverClaim.resolution`: `WON`, `OUTBID`, `INSUFFICIENT_FAAB`, `ROSTER_FULL`, `ALREADY_ROSTERED`, `DROP_MISSING`.

**Trades.** A trade can move players, future picks, and FAAB. Seeded settings use commissioner review, a 24-hour window, a deadline at week 18, and pick trading enabled.

**Playoffs.** Six teams. Seeds 1 and 2 have a bye in week 15. Seed 1 then plays the winner of 4 vs 5; seed 2 plays the winner of 3 vs 6. A tie goes to the higher seed (`lib/playoff-bracket.ts`).

**Draft.** `Draft` / `DraftSlot` is the live snake draft. `DraftPick` is the tradable future-pick asset. They are separate tables.

## Scoring

Matchup totals and `PlayerGameStat.fantasyPoints` use `scoreGameStat` in `lib/scoring.ts`. Weights come from `League.scoringSettings`, filled in by `DEFAULT_LEAGUE_SCORING` when a key is missing:

| Skater | Pts | Goalie | Pts |
| --- | ---: | --- | ---: |
| Goal | 3 | Win | 4 |
| Assist | 2 | Save | 0.2 |
| Shot | 0.2 | Goal against | -1 |
| Hit | 0.2 | Shutout | 3 |
| Block | 0.2 | | |

The commissioner can change those weights. `rescoreAllStats` rewrites stored fantasy points after a change.

Player cards, season totals, and projections use `calculateSkaterFPTS` and `calculateGoalieFPTS` in `lib/hockey-data.ts`. That formula is fixed (shots 0.3, hits 0.25, blocks 0.35, plus power-play points, short-handed goals, and game-winning goals) and does not read league settings. Change the function that actually feeds the screen you are looking at.

## Auth

`POST /api/auth/login` checks the manager's PIN and sets an HTTP-only cookie named `dynasty_manager` for 30 days. The payload is `{ managerId, teamId, handle, teamName, isCommissioner }`. `lib/auth-session.ts` reads it. Logging out is `DELETE /api/auth/session`.

## NHL sync and waivers jobs

Both cron routes accept `Authorization: Bearer $CRON_SECRET`, `?secret=`, or a signed-in commissioner.

| Route | When it runs | What it does |
| --- | --- | --- |
| `GET /api/cron/sync` | GitHub Actions every 5 minutes from 23:00–05:00 UTC (`.github/workflows/nhl-sync.yml`) | Pulls the NHL schedule and box scores, locks lineups, and recomputes matchup scores. `?backfill=1` covers the season so far; otherwise it syncs last week, this week, and next week |
| `GET /api/cron/waivers` | Vercel cron Monday at 04:00, 05:00, and 12:00 UTC (`vercel.json`) | Processes due FAAB claims once Monday midnight has passed and every game that week is final |

`lib/services/nhl-sync.ts` talks to the NHL API. `lib/services/transactions.ts` owns waiver processing, trades, and roster moves.

## API routes

All routes return `NextResponse.json` with an explicit status.

| Route | Purpose |
| --- | --- |
| `/api/auth/login`, `/api/auth/session` | PIN login and the current session |
| `/api/roster/move`, `/api/roster/week` | Lineup edits and a frozen week |
| `/api/players`, `/api/waivers` | Player pool and FAAB claims |
| `/api/trades` | Offers, assets, accept / reject |
| `/api/schedule`, `/api/team-stats` | Week schedule and scoring |
| `/api/draft` | Live draft room |
| `/api/activity` | League transaction feed |
| `/api/chat`, `/api/messages` | League chat and direct messages |
| `/api/news`, `/api/headshot` | News and player photos |
| `/api/teams/settings` | Team name and logo |
| `/api/admin/league-settings`, `/api/admin/roles` | Commissioner controls |

## Where things live

```
app/page.tsx                 Server page: session, roster, standings, schedule
app/dashboard-client.tsx     The four tabs and client state
components/hockey/           Lineup, matchup, market, draft, chat, settings
components/auth/pin-gate.tsx PIN screen
lib/scoring.ts               League scoring used for matchups
lib/hockey-data.ts           Roster shapes, display scoring, seed fixtures
lib/season-calendar.ts       Monday–Sunday week math
lib/services/                NHL sync, transactions, locks, draft, week lineups
prisma/schema.prisma         Users, league, rosters, waivers, trades, games
prisma/seed.ts               Dev league
e2e/                         Playwright specs
```

## Tests

Playwright starts `npm run dev` unless one is already running outside CI. The setup project signs in as Montreal Monarchs with PIN `1234` and writes `e2e/.auth/manager.json`. Specs run in Chromium at 430×932.

```bash
npm run test:e2e
npx tsc --noEmit
```

The database must already be seeded. Specs hit the real league, including roster moves, trades, and waivers.
