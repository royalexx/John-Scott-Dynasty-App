import assert from "node:assert/strict"
import { displacedLandingSlot, positionFitsSlot } from "../lib/roster-eligibility"

assert.equal(positionFitsSlot("G", "D"), false)
assert.equal(positionFitsSlot("G", "G"), true)
assert.equal(positionFitsSlot("BN", "D"), true)

assert.equal(displacedLandingSlot("G", "D", true), "BN", "defenseman off IR goes to the bench, not goalie")
assert.equal(displacedLandingSlot("G", "D", false), null, "full bench blocks the illegal goalie landing")
assert.equal(displacedLandingSlot("G", "G", false), "G", "a goalie can take the vacated goalie slot")
assert.equal(displacedLandingSlot("D", "D", false), "D")
assert.equal(displacedLandingSlot("F", "C", false), "F")
assert.equal(displacedLandingSlot("W", "C", true), "BN")

console.log("roster swap checks passed")
