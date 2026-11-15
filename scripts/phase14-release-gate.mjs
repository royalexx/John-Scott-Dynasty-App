/**
 * Phase 14 fail-closed production release gate.
 *
 * --audit (default): read-only report and exit successfully even when blocked,
 *   so draft PRs can be reviewed without falsely advertising launch readiness.
 * --require-ready: fail unless all independently recorded checks are verified,
 *   the reviewer has approved the exact HEAD commit, and explicit deployment
 *   approval is present. Never performs migrations, network calls or deploys.
 *
 * The evidence file contains status and references ONLY: no secrets or URLs
 * with credentials. Independent protected review must validate each reference.
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { resolve } from "node:path"

export const RELEASE_CHECKS = Object.freeze([
  "candidateBuildAndRegression",
  "stagingDatabaseIsolated",
  "productionDatabaseMigrationInventory",
  "productionLeagueReadiness",
  "realManagerCredentialsAndAccess",
  "stagingEndToEndOperations",
  "rollbackAndMonitoringReview",
  "ownerReleaseApproval",
])

const EVIDENCE_PATH = new URL("../docs/PHASE_14_RELEASE_EVIDENCE.json", import.meta.url)
const EXPECTED_TARGET = "johnscottdynasty.live"

const hasEvidence = (value) =>
  typeof value === "string" && value.trim().length >= 12 &&
  !/placeholder|todo|pending|tbd|example\.com|your-url|paste-here/i.test(value)

export function evaluateReleaseEvidence(data) {
  const blockers = []
  if (!data || data.schemaVersion !== 1 || data.target !== EXPECTED_TARGET || data.release !== "john-scott-dynasty-initial-overhaul") {
    blockers.push("Release manifest identity, schema version or target does not match the approved project")
  }
  for (const key of RELEASE_CHECKS) {
    const record = data?.checks?.[key]
    if (!record || record.status !== "verified" || !hasEvidence(record.evidence)) {
      blockers.push(`${key}: not independently verified with a non-secret evidence reference`)
    }
  }
  return {
    mode: "read_only",
    target: EXPECTED_TARGET,
    readyForReleaseReview: blockers.length === 0,
    blockers,
    verifiedCheckCount: RELEASE_CHECKS.length - blockers.filter((x) => RELEASE_CHECKS.some((key) => x.startsWith(key + ":"))).length,
    totalChecks: RELEASE_CHECKS.length,
  }
}

function gitHead() {
  return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
}

function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => !["--audit", "--require-ready"].includes(arg))) {
    throw new Error("Allowed flags: --audit and --require-ready")
  }
  const strict = args.includes("--require-ready")
  const manifest = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
  const result = evaluateReleaseEvidence(manifest)
  if (strict) {
    const head = gitHead()
    if (process.env.APPROVED_RELEASE_SHA !== head) {
      result.blockers.push("The independently reviewed exact HEAD SHA is missing or does not match APPROVED_RELEASE_SHA")
    }
    if (process.env.RELEASE_OWNER_APPROVED !== "YES_FOR_THIS_EXACT_SHA") {
      result.blockers.push("Explicit current-commit production release approval is missing")
    }
  }
  const status = result.blockers.length === 0 ? (strict ? "READY_FOR_MANUAL_RELEASE" : "EVIDENCE_COMPLETE_PENDING_MANUAL_APPROVAL") : "BLOCKED"
  // Do not log environmental variables or evidence references. Only log check
  // names and safe status values. This is not permission to deploy.
  console.log(JSON.stringify({
    mode: result.mode,
    target: result.target,
    status,
    verifiedChecks: result.verifiedCheckCount,
    totalChecks: result.totalChecks,
    blockers: result.blockers,
    productionDeployed: false,
    note: "This gate is a prerequisite only, never a deployment. Inspect the protected environment and approve the staged exact SHA separately.",
  }, null, 2))
  if (strict && result.blockers.length > 0) process.exitCode = 2
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main()
}
