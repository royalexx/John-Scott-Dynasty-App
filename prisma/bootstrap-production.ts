/**
 * Explicit, one-time first-league initialization after all migrations have
 * succeeded on a genuinely empty PostgreSQL database. This entry point is not
 * part of Next.js/Vercel boot or a Prisma migration.
 *
 * Requires:
 *   JSD_BOOTSTRAP_CONFIRM=INITIALIZE_NEW_EMPTY_JOHN_SCOTT_LEAGUE
 *   DATABASE_URL=<direct PostgreSQL connection>
 *
 * See docs/PRODUCTION_FIRST_LEAGUE.md before executing.
 */
if (process.env.JSD_BOOTSTRAP_CONFIRM !== "INITIALIZE_NEW_EMPTY_JOHN_SCOTT_LEAGUE") {
  throw new Error("Production bootstrap refused: explicit confirmation is required.")
}
if (!/^postgres(ql)?:\/\//.test(process.env.DATABASE_URL ?? "")) {
  throw new Error("Production bootstrap refused: a direct PostgreSQL DATABASE_URL is required.")
}
process.env.JSD_BOOTSTRAP_MODE = "production"
require("./seed")
