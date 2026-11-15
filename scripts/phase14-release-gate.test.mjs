import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { test } from "node:test"
import { RELEASE_CHECKS, evaluateReleaseEvidence } from "./phase14-release-gate.mjs"

const complete = () => ({
  schemaVersion: 1,
  target: "johnscottdynasty.live",
  release: "john-scott-dynasty-initial-overhaul",
  checks: Object.fromEntries(RELEASE_CHECKS.map((key) => [key, {
    status: "verified",
    evidence: `review-reference-${key}-confirmed`,
  }])),
})

test("default release manifest remains blocked before protected database and owner sign-off", async () => {
  const { readFileSync } = await import("node:fs")
  const manifest = JSON.parse(readFileSync(new URL("../docs/PHASE_14_RELEASE_EVIDENCE.json", import.meta.url), "utf8"))
  const report = evaluateReleaseEvidence(manifest)
  assert.equal(report.readyForReleaseReview, false)
  assert.equal(report.verifiedCheckCount, 0)
  assert.deepEqual(
    report.blockers.filter((reason) => reason.includes(": not independently verified")).length,
    RELEASE_CHECKS.length,
  )
})

test("missing checks cannot be treated as verified", () => {
  const record = complete()
  delete record.checks.stagingDatabaseIsolated
  let result = evaluateReleaseEvidence(record)
  assert.equal(result.readyForReleaseReview, false)
  assert.ok(result.blockers.some((reason) => reason.startsWith("stagingDatabaseIsolated:")))
  record.checks.stagingDatabaseIsolated = { status: "verified", evidence: "TODO" }
  result = evaluateReleaseEvidence(record)
  assert.equal(result.readyForReleaseReview, false)
})

test("all eight independently verified checks constitute evidence completeness, not deployment", () => {
  const report = evaluateReleaseEvidence(complete())
  assert.equal(report.readyForReleaseReview, true)
  assert.equal(report.verifiedCheckCount, 8)
  assert.equal(report.blockers.length, 0)
  const wrongTarget = complete()
  wrongTarget.target = "unrelated.example"
  assert.equal(evaluateReleaseEvidence(wrongTarget).readyForReleaseReview, false)
})

test("strict release CLI refuses without exact reviewed SHA or explicit operator approval", () => {
  const result = spawnSync(process.execPath, ["scripts/phase14-release-gate.mjs", "--require-ready"], {
    env: { ...process.env, APPROVED_RELEASE_SHA: "", RELEASE_OWNER_APPROVED: "" },
    encoding: "utf8",
  })
  assert.equal(result.status, 2)
  assert.match(result.stdout, /"status": "BLOCKED"/)
  assert.match(result.stdout, /productionDeployed": false/)
})

test("audit CLI emits a useful blocked report without failing the draft PR", () => {
  const result = spawnSync(process.execPath, ["scripts/phase14-release-gate.mjs", "--audit"], {
    encoding: "utf8",
  })
  assert.equal(result.status, 0)
  const payload = JSON.parse(result.stdout)
  assert.equal(payload.status, "BLOCKED")
  assert.equal(payload.productionDeployed, false)
  assert.equal(payload.totalChecks, 8)
})
