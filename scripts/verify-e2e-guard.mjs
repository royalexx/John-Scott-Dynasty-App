import { spawnSync } from "node:child_process"

// Exercise the real Playwright config with --list (no test body or HTTP call runs).
// It must reject unsafe targets before a browser or web server can start.
const command = ["playwright", "test", "--list", "--config", "playwright.config.ts"]
const local = "postgresql://fixture:fixture@127.0.0.1:5432/johnscott_e2e"
const cases = [
  { label: "missing explicit opt-in", optIn: undefined, url: local, allow: false },
  { label: "remote database", optIn: "1", url: "postgresql://fixture:fixture@database.example.invalid/johnscott_e2e", allow: false },
  { label: "non-test local database", optIn: "1", url: "postgresql://fixture:fixture@127.0.0.1:5432/johnscott", allow: false },
  { label: "explicit local test database", optIn: "1", url: local, allow: true },
]

for (const entry of cases) {
  const env = { ...process.env, DATABASE_URL: entry.url }
  if (entry.optIn === undefined) delete env.E2E_ALLOW_MUTATION
  else env.E2E_ALLOW_MUTATION = entry.optIn
  const run = spawnSync("npx", command, {
    env,
    encoding: "utf8",
    timeout: 90_000,
    windowsHide: true,
  })
  const succeeded = run.status === 0
  if (run.error || succeeded !== entry.allow) {
    const detail = (run.stderr || run.stdout || String(run.error)).slice(-1000)
    throw new Error("E2E safety gate failed case: " + entry.label + "\n" + detail)
  }
  console.log("PASS: " + entry.label + (entry.allow ? " is accepted" : " is blocked"))
}
