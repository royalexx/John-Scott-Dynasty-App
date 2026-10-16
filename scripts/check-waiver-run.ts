import assert from "node:assert/strict"
import { mondayMidnightAfter, nextWaiverProcessAt, runInstantForProcessDate, waiverOutcomeLabel, waiverRunReadyForWeek } from "../lib/waiver-run"

const edt = mondayMidnightAfter("2026-10-18")
assert.equal(edt.toISOString(), "2026-10-19T04:00:00.000Z", edt.toISOString())

const est = mondayMidnightAfter("2027-01-03")
assert.equal(est.toISOString(), "2027-01-04T05:00:00.000Z", est.toISOString())

const duringWeek = nextWaiverProcessAt(2026, new Date("2026-10-16T15:00:00.000Z"))
assert.equal(duringWeek.toISOString(), "2026-10-19T04:00:00.000Z")

assert.equal(waiverRunReadyForWeek(2026, 3, ["FINAL", "OFF"], new Date("2026-10-19T04:05:00.000Z")).ready, true)
assert.equal(waiverRunReadyForWeek(2026, 3, ["FINAL"], new Date("2026-10-19T03:59:00.000Z")).ready, false)

const live = waiverRunReadyForWeek(2026, 3, ["FINAL", "LIVE"], new Date("2026-10-19T04:05:00.000Z"))
assert.equal(live.ready, false)

const filedThursday = runInstantForProcessDate(2026, new Date("2026-10-15T16:00:00.000Z"))
assert.equal(filedThursday.week, 3)
assert.equal(filedThursday.runAt.toISOString(), "2026-10-19T04:00:00.000Z")
assert.equal(waiverRunReadyForWeek(2026, filedThursday.week, ["FINAL"], new Date("2026-10-16T15:00:00.000Z")).ready, false)

assert.equal(waiverOutcomeLabel("SUCCESSFUL", "WON"), "Won")
assert.equal(waiverOutcomeLabel("FAILED", "OUTBID"), "Outbid")
assert.equal(waiverOutcomeLabel("FAILED", "INSUFFICIENT_FAAB"), "Not enough FAAB")
assert.equal(waiverOutcomeLabel("FAILED", "ROSTER_FULL"), "No open roster spot")

console.log("waiver-run checks passed")
