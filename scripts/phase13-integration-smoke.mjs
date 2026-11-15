/**
 * Disposable-PostgreSQL integration rehearsal for Phase 13.
 * The runner injects a loopback-only DATABASE_URL; never use a hosted URL.
 * All private PIN input stays in process memory and is never printed or saved.
 */
import { spawnSync } from "node:child_process"
import { scryptSync, timingSafeEqual, randomBytes } from "node:crypto"
import { PrismaClient } from "@prisma/client"

const loopback = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/invalid")
if (!["127.0.0.1", "localhost", "::1"].includes(loopback.hostname) ||
  !/phase13/.test(loopback.pathname)) {
  throw new Error("Phase 13 smoke tests require an isolated loopback database named for phase13")
}

const teamNames = [
  "Montreal Monarchs", "Toronto Titans", "Vancouver Voyagers", "Colorado Summit",
  "Florida Waves", "Detroit Motors", "Boston Blades", "Ottawa Outlaws",
  "Tampa Bay Bolts", "Calgary Comets", "Team WisconsinVVB", "Daejon Love's Team",
]
const managers = teamNames.map((teamName, index) => ({
  teamName, managerName: `Phase 13 Manager ${index + 1}`,
  handle: `manager${index + 1}`, email: `manager${index + 1}@league.test`,
  pin: String(5100 + index), isCommissioner: index === 0,
}))
const config = JSON.stringify({ managers })
const env = {
  ...process.env,
  LEAGUE_BOOTSTRAP_TARGET: "staging",
  LEAGUE_BOOTSTRAP_CONFIRM: "INITIALIZE_EMPTY_STAGING_LEAGUE",
}
function invoke(path, args = [], input = config, environment = env) {
  const result = spawnSync("npx", ["ts-node", "--project", "tsconfig.seed.json", path, ...args], {
    input, env: environment, encoding: "utf8", timeout: 120_000, windowsHide: true,
  })
  if (result.error) throw new Error("Script execution failed")
  return result
}
function verifyPin(hash, pin) {
  const [method, salt, value] = hash.split("$")
  if (method !== "scrypt" || !salt || !value) return false
  const expected = Buffer.from(value, "base64url")
  if (!expected.length) return false
  const actual = scryptSync(pin, salt, expected.length)
  return timingSafeEqual(expected, actual)
}
function hashPin(pin) {
  const salt = randomBytes(16).toString("base64url")
  return `scrypt$${salt}$${scryptSync(pin, salt, 32).toString("base64url")}`
}
function assert(ok, label) {
  if (!ok) throw new Error("Phase 13 integration check failed: " + label)
  console.log("PASS: " + label)
}

const before = invoke("scripts/league-readiness.ts", [], "")
assert(before.status === 1 && before.stdout.includes("LEAGUE_NOT_INITIALIZED"), "empty migrated database is not release-ready")
const dry = invoke("scripts/bootstrap-league.ts", [])
assert(dry.status === 0 && dry.stdout.includes('"validation_only"'), "bootstrap is validation-only by default")
const invalid = invoke("scripts/bootstrap-league.ts", [], JSON.stringify({
  managers: managers.map((manager, index) => index ? manager : { ...manager, pin: "1234" }),
}))
assert(invalid.status === 1, "demo PIN input is rejected before database access")
const unapproved = invoke("scripts/bootstrap-league.ts", ["--apply"], config, {
  ...process.env, LEAGUE_BOOTSTRAP_TARGET: "staging",
})
assert(unapproved.status === 1, "database writes require explicit authorization")

const seeded = invoke("scripts/bootstrap-league.ts", ["--apply"])
assert(seeded.status === 0 && seeded.stdout.includes('"staging_initialized"'), "isolated staging initialization succeeds")
const ready = invoke("scripts/league-readiness.ts", [], "")
assert(ready.status === 0 && ready.stdout.includes('"verdict": "READY"'), "read-only doctor validates full league configuration")

const first = new PrismaClient()
let firstPinHash
try {
  const [league, users, teams, matches, picks, players, rosters] = await Promise.all([
    first.league.findUnique({ where: { id: "00000000-0000-0000-0000-000000000001" } }),
    first.user.findMany({ orderBy: { handle: "asc" }, select: { id: true, handle: true, pin: true, isCommissioner: true } }),
    first.team.count(), first.matchup.count(), first.draftPick.count(), first.player.count(), first.rosterSlot.count(),
  ])
  assert(Boolean(league) && users.length === 12 && teams === 12 && matches === 144 && picks === 180 &&
    players > 0 && rosters === 0, "database contains exactly the intended league, registry and fixtures")
  assert(users.every((user) => user.pin.startsWith("scrypt$") &&
    verifyPin(user.pin, managers.find((manager) => manager.handle === user.handle)?.pin ?? "")),
    "all PINs are salted database hashes and resolve to the configured manager")
  assert(users.filter((user) => user.isCommissioner).length === 1, "one commissioner persisted")
  // A PIN change on the disposable DB must survive a completely new client.
  const manager = users.find((user) => user.handle === "manager1")
  if (!manager) throw new Error("Fixture manager is missing")
  firstPinHash = manager.pin
  await first.user.update({ where: { id: manager.id }, data: { pin: hashPin("6999") } })
} finally {
  await first.$disconnect()
}

const second = new PrismaClient()
try {
  const manager = await second.user.findUniqueOrThrow({ where: { handle: "manager1" }, select: { pin: true } })
  assert(manager.pin !== firstPinHash && verifyPin(manager.pin, "6999") &&
    !verifyPin(manager.pin, "5100"), "PIN rotation persists across independent Prisma clients")
} finally {
  await second.$disconnect()
}
const repeated = invoke("scripts/bootstrap-league.ts", ["--apply"])
assert(repeated.status === 1, "second initialization cannot reset an existing league")
const after = invoke("scripts/league-readiness.ts", [], "")
assert(after.status === 0 && after.stdout.includes('"verdict": "READY"'),
  "existing league remains ready after attempted repeat initialization")
console.log("Phase 13 staging-only persistence rehearsal completed; no hosted database accessed")
