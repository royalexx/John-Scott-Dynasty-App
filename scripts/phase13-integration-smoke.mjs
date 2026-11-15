/**
 * Disposable-PostgreSQL integration rehearsal for Phase 13.
 * The runner injects a loopback-only DATABASE_URL; never use a hosted URL.
 * All private PIN input stays in process memory and is never printed or saved.
 */
import { spawn, spawnSync } from "node:child_process"
import { scryptSync, timingSafeEqual } from "node:crypto"
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
let authenticatedManagerId
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
  authenticatedManagerId = manager.id
} finally {
  await first.$disconnect()
}

// Exercise the actual Next.js authentication API with the staging fixture.
// Only the isolated loopback DB is used; cookies remain in process memory.
async function testHttpAuthentication(managerId) {
  const base = "http://127.0.0.1:3233"
  const app = spawn(process.execPath, [
    "node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "--port", "3233",
  ], {
    env: { ...process.env, NODE_ENV: "development", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "pipe", "pipe"], detached: true,
  })
  // Drain output without displaying server/session data or DB connection strings.
  app.stdout.on("data", () => {})
  app.stderr.on("data", () => {})
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  try {
    let accessible = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (app.exitCode !== null) break
      try {
        const response = await fetch(base + "/api/auth/session", { signal: AbortSignal.timeout(3000) })
        if (response.status === 200) { accessible = true; break }
      } catch { /* Compiling or starting the local Next.js server. */ }
      await sleep(400)
    }
    assert(accessible, "isolated real-application auth endpoint starts")
    const page = await fetch(base + "/")
    assert(page.status === 200 && (await page.text()).includes("Manager Access"),
      "real league is presented through the manager PIN gate")

    const postPin = (pin) => fetch(base + "/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ managerId, pin }),
    })
    const signedIn = await postPin("5100")
    assert(signedIn.status === 200, "real manager PIN authentication succeeds")
    const rawCookie = signedIn.headers.get("set-cookie") ?? ""
    const previousCookie = rawCookie.split(";")[0]
    assert(previousCookie.startsWith("dynasty_manager=") &&
      /;\s*HttpOnly\b/i.test(rawCookie) && /;\s*SameSite=Lax\b/i.test(rawCookie),
      "login issues an HttpOnly, SameSite=Lax manager cookie")
    const oldSession = await fetch(base + "/api/auth/session", { headers: { Cookie: previousCookie } })
    assert((await oldSession.json()).authenticated === true, "manager cookie authenticates a second HTTP request")

    const rotated = await fetch(base + "/api/auth/login", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: previousCookie },
      body: JSON.stringify({ currentPin: "5100", newPin: "6999" }),
    })
    assert(rotated.status === 200, "authenticated PIN rotation succeeds through the real API")
    const newCookie = rotated.headers.get("set-cookie")?.split(";")[0]
    assert(Boolean(newCookie?.startsWith("dynasty_manager=")), "PIN rotation reissues the active session")
    const oldAfterRotation = await fetch(base + "/api/auth/session", { headers: { Cookie: previousCookie } })
    const newAfterRotation = await fetch(base + "/api/auth/session", { headers: { Cookie: newCookie } })
    assert((await oldAfterRotation.json()).authenticated === false &&
      (await newAfterRotation.json()).authenticated === true,
      "old signed sessions are invalidated while the rotated session remains valid")
    const rejectedOld = await postPin("5100")
    assert(rejectedOld.status === 401, "old PIN is refused by the real login endpoint")
    const acceptedNew = await postPin("6999")
    assert(acceptedNew.status === 200, "rotated PIN authenticates in a new session")
  } finally {
    // Kill the whole detached process group so Next dev workers cannot linger.
    if (app.pid) {
      try { process.kill(-app.pid, "SIGTERM") } catch { /* It exited already. */ }
    }
  }
}
await testHttpAuthentication(authenticatedManagerId)

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
