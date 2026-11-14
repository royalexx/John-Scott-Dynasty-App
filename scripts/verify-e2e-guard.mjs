import { spawnSync } from "node:child_process"

// Validate the consolidated backend's fail-closed TEST_DATABASE_URL contract.
// --list loads the real Playwright config but does not start the server or issue
// database writes. Never use a real or remotely hosted connection string here.
const command = ["playwright", "test", "--list", "--config", "playwright.config.ts"]
const local = "postgresql://fixture:fixture@127.0.0.1:5432/johnscott_e2e"
const cases = [
  { label: "missing dedicated test database", testUrl: undefined, allow: false },
  { label: "remote database", testUrl: "postgresql://fixture:fixture@database.example.invalid/johnscott_e2e", allow: false },
  { label: "non-test local database", testUrl: "postgresql://fixture:fixture@127.0.0.1:5432/johnscott", allow: false },
  { label: "invalid protocol", testUrl: "http://127.0.0.1/johnscott_e2e", allow: false },
  { label: "explicit local E2E database", testUrl: local, allow: true },
]

for (const entry of cases) {
  const env = { ...process.env }
  if (entry.testUrl === undefined) delete env.TEST_DATABASE_URL
  else env.TEST_DATABASE_URL = entry.testUrl
  // Assert that a separate existing DATABASE_URL is never treated as E2E opt-in.
  env.DATABASE_URL = "postgresql://do-not-use:do-not-use@remote.example.invalid/production"
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
