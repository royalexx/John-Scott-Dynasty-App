import assert from "node:assert/strict"
import { buildPlayoffBracket, type PlayoffResult } from "../lib/playoff-bracket"

const teams = ["One", "Two", "Three", "Four", "Five", "Six", "Seven"]
const standings = teams.map((team) => ({ team }))

function game(week: number, homeTeam: string, awayTeam: string, homeScore: number, awayScore: number, isFinal: boolean): PlayoffResult {
  return { week, homeTeam, awayTeam, homeScore, awayScore, isFinal }
}

const projected = buildPlayoffBracket({ standings, results: [], currentWeek: 3 })
assert.equal(projected.live, false)
assert.equal(projected.rounds[0].games[0].status, "Bye")
assert.equal(projected.rounds[0].games[0].home.label, "#1 One")
assert.equal(projected.rounds[0].games[2].home.label, "#3 Three")
assert.equal(projected.rounds[0].games[2].away?.label, "#6 Six")
assert.equal(projected.rounds[0].games[2].home.points, null)
assert.equal(projected.rounds[1].games[0].away?.label, "Winner of #4 vs #5")
assert.equal(projected.rounds[2].games[0].home.label, "Winner of semifinals")

const live = buildPlayoffBracket({
  standings,
  currentWeek: 15,
  results: [
    game(15, "Three", "Other", 10, 4, false),
    game(15, "Six", "Another", 12, 3, false),
  ],
})
assert.equal(live.live, true)
assert.equal(live.rounds[0].games[2].status, "Live")
assert.equal(live.rounds[0].games[2].home.points, 10)
assert.equal(live.rounds[0].games[2].away?.points, 12)
assert.equal(live.rounds[0].games[2].home.winner, false)

const decided = buildPlayoffBracket({
  standings,
  currentWeek: 16,
  results: [
    game(15, "Three", "Other", 10, 1, true),
    game(15, "Six", "Another", 14, 2, true),
    game(15, "Four", "X", 9, 1, true),
    game(15, "Five", "Y", 8, 1, true),
    game(16, "Two", "Z", 20, 1, true),
    game(16, "Six", "Q", 11, 1, true),
  ],
})
const firstLow = decided.rounds[0].games[2]
assert.equal(firstLow.status, "Final")
assert.equal(firstLow.away?.winner, true)
assert.equal(firstLow.away?.team, "Six")
const semiTwo = decided.rounds[1].games[1]
assert.equal(semiTwo.home.team, "Two")
assert.equal(semiTwo.away?.team, "Six")
assert.equal(semiTwo.status, "Final")
assert.equal(semiTwo.home.winner, true)

const tied = buildPlayoffBracket({
  standings,
  currentWeek: 15,
  results: [game(15, "Four", "A", 7, 0, true), game(15, "Five", "B", 7, 0, true)],
})
assert.equal(tied.rounds[0].games[3].home.winner, true)
assert.equal(tied.rounds[0].games[3].home.team, "Four")

console.log("playoff bracket checks passed")
