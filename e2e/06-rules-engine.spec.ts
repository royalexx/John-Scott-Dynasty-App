import { expect, test } from "@playwright/test"
import { getFantasyWeekDates, getFantasyWeekForDate, getCurrentFantasyWeek } from "../lib/season-calendar"
import { computeStandings, isCompletedMatchup } from "../lib/standings"
import { hasWeekStarted, isSlotLocked, isStarterSlot, normalizeLockMode, type LockContext } from "../lib/lineup-lock"
import { displacedLandingSlot, hasRoomForBenchAcquisition, positionFitsSlot, previewPlayerTransfers } from "../lib/roster-eligibility"
import { isWeekFinal, scoreTeams, scoreTeamsByGame } from "../lib/matchup-scoring"
import { DEFAULT_LEAGUE_SCORING, scoreGameStat, type RawGameStat } from "../lib/scoring"
import { hashManagerPin, isHashedManagerPin, verifyManagerPin } from "../lib/pin-crypto"
import { remainingPinLockout } from "../lib/pin-rate-limit"
import { missingSnapshotTeamIds } from "../lib/services/week-lineups"
import { PlayerStatus, SlotType } from "@prisma/client"
import { previewFutureMove, rosterMatchesPlan } from "../lib/services/future-lineup-plans"
import { missingDailyGameCoverage } from "../lib/services/daily-game-lineups"

const stat = (overrides: Partial<RawGameStat> = {}): RawGameStat => ({
  goals: 0, assists: 0, shots: 0, hits: 0, blocks: 0, plusMinus: 0, powerPlayPoints: 0, shorthandedGoals: 0,
  gameWinningGoals: 0, saves: 0, goalsAgainst: 0, shutouts: 0, decision: null, ...overrides,
})

test.describe("distributed PIN throttle", () => {
  test("locks a bucket after five attempts within its expiry window", () => {
    const now = new Date("2026-11-13T12:00:00Z")
    const resetAt = new Date(now.getTime() + 300_000)
    expect(remainingPinLockout([{ failures: 4, resetAt }], now)).toBe(0)
    expect(remainingPinLockout([{ failures: 5, resetAt }], now)).toBe(300)
    expect(remainingPinLockout([{ failures: 9, resetAt: new Date(now.getTime() - 1) }], now)).toBe(0)
  })
})

test.describe("manager PIN security", () => {
  test("new credentials store salted hashes rather than plaintext", () => {
    const hashA = hashManagerPin("1234")
    const hashB = hashManagerPin("1234")
    expect(hashA).not.toBe("1234")
    expect(hashA).not.toBe(hashB)
    expect(isHashedManagerPin(hashA)).toBe(true)
    expect(verifyManagerPin(hashA, "1234")).toBe(true)
    expect(verifyManagerPin(hashA, "9999")).toBe(false)
  })
  test("legacy plaintext PINs remain verifiable for one-time upgrade", () => {
    expect(verifyManagerPin("1234", "1234")).toBe(true)
    expect(verifyManagerPin("1234", "4321")).toBe(false)
    expect(isHashedManagerPin("1234")).toBe(false)
  })
})

test.describe("season calendar (Monday to Sunday NHL weeks)", () => {
  test("Monday 2026-10-12 is the start of week 3", () => {
    expect(getFantasyWeekForDate("2026-10-12")).toBe(3)
    expect(getFantasyWeekDates(3).startDate).toBe("2026-10-12")
    expect(getCurrentFantasyWeek(2026, new Date("2026-10-12T16:00:00Z"))).toBe(3)
  })

  test("week 1 starts Monday 2026-09-28 and week 2 starts 2026-10-05", () => {
    expect(getFantasyWeekDates(1).startDate).toBe("2026-09-28")
    expect(getFantasyWeekDates(2).startDate).toBe("2026-10-05")
  })

  test("every week is seven days, Monday first and Sunday last", () => {
    for (let week = 1; week <= 24; week += 1) {
      const { dates, startDate, endDate } = getFantasyWeekDates(week)
      expect(dates).toHaveLength(7)
      expect(new Date(`${startDate}T12:00:00Z`).getUTCDay()).toBe(1)
      expect(new Date(`${endDate}T12:00:00Z`).getUTCDay()).toBe(0)
    }
  })

  test("Sunday night still belongs to the old week and Monday rolls over", () => {
    expect(getFantasyWeekForDate("2026-10-11")).toBe(2)
    expect(getFantasyWeekForDate("2026-10-18")).toBe(3)
    expect(getFantasyWeekForDate("2026-10-19")).toBe(4)
  })

  test("round trip: every date in a week maps back to that week", () => {
    for (const week of [1, 2, 3, 10, 24]) {
      for (const date of getFantasyWeekDates(week).dates) expect(getFantasyWeekForDate(date)).toBe(week)
    }
  })

  test("US/Eastern is used to pick the day (late-night games belong to the Eastern date)", () => {
    // 2026-10-12 02:30 UTC is still Sunday evening 22:30 in New York, i.e. week 2.
    expect(getCurrentFantasyWeek(2026, new Date("2026-10-12T02:30:00Z"))).toBe(2)
  })

  test("dates after the last fantasy week clamp to week 24", () => {
    expect(getCurrentFantasyWeek(2026, new Date("2027-04-15T12:00:00Z"))).toBe(24)
  })
})

test.describe("league scoring", () => {
  test("default league rules: goal 3, assist 2, shot 0.2, hit 0.2, block 0.2", () => {
    expect(scoreGameStat(stat({ goals: 1, assists: 1, shots: 5, hits: 5, blocks: 5 }), DEFAULT_LEAGUE_SCORING)).toBe(8)
  })

  test("goalies: win 4, saves 0.2, goals against -1, shutout 3", () => {
    expect(scoreGameStat(stat({ decision: "W", saves: 30, goalsAgainst: 2, shutouts: 0 }), DEFAULT_LEAGUE_SCORING)).toBe(8)
    expect(scoreGameStat(stat({ decision: "W", saves: 25, goalsAgainst: 0, shutouts: 1 }), DEFAULT_LEAGUE_SCORING)).toBe(12)
    expect(scoreGameStat(stat({ decision: "L", saves: 20, goalsAgainst: 4 }), DEFAULT_LEAGUE_SCORING)).toBe(0)
  })

  test("commissioner overrides change the result (power play points, plus/minus, OT loss)", () => {
    const custom = { ...DEFAULT_LEAGUE_SCORING, ppp: 1, plusMinus: 0.5, overtimeLoss: 1 }
    expect(scoreGameStat(stat({ powerPlayPoints: 2, plusMinus: -2 }), custom)).toBe(1)
    expect(scoreGameStat(stat({ decision: "OT", saves: 10, goalsAgainst: 3 }), custom)).toBe(0)
  })

  test("missing settings fall back to defaults", () => {
    expect(scoreGameStat(stat({ goals: 2 }), undefined)).toBe(6)
    expect(scoreGameStat(stat({ goals: 2 }), {})).toBe(6)
  })
})

test.describe("matchup scoring", () => {
  const slots = [
    { teamId: "A", playerId: 1, slot: "C" },
    { teamId: "A", playerId: 2, slot: "BN" },
    { teamId: "A", playerId: 3, slot: "IR" },
    { teamId: "B", playerId: 4, slot: "G" },
    { teamId: "B", playerId: 5, slot: "TAXI" },
  ]
  const stats = [1, 2, 3, 4, 5].map((playerId) => ({ playerId, ...stat({ goals: 1 }) }))

  test("only starters score; bench, IR and taxi never count", () => {
    const totals = scoreTeams(slots, stats, DEFAULT_LEAGUE_SCORING)
    expect(totals.get("A")).toBe(3)
    expect(totals.get("B")).toBe(3)
  })

  test("a team with no starters stays at 0 and a player without stats adds nothing", () => {
    const totals = scoreTeams([{ teamId: "A", playerId: 9, slot: "BN" }], [{ playerId: 9, ...stat({ goals: 4 }) }], DEFAULT_LEAGUE_SCORING)
    expect(totals.get("A") ?? 0).toBe(0)
  })

  test("multiple games in a week add up", () => {
    const totals = scoreTeams([{ teamId: "A", playerId: 1, slot: "W" }], [{ playerId: 1, ...stat({ goals: 1 }) }, { playerId: 1, ...stat({ assists: 2 }) }], DEFAULT_LEAGUE_SCORING)
    expect(totals.get("A")).toBe(7)
  })

  test("a week is final only after it ended and all NHL games are finished", () => {
    expect(isWeekFinal("2026-10-11", "2026-10-12", ["FINAL", "OFF"])).toBe(true)
    expect(isWeekFinal("2026-10-18", "2026-10-12", ["FINAL"])).toBe(false)
    expect(isWeekFinal("2026-10-11", "2026-10-12", ["FINAL", "LIVE"])).toBe(false)
    expect(isWeekFinal("2026-10-11", "2026-10-12", ["FINAL", "FUT"])).toBe(false)
    expect(isWeekFinal("2026-10-11", "2026-10-12", [])).toBe(false)
  })
})

test.describe("standings from matchup results", () => {
  const m = (week: number, home: string, away: string, hs: number | null, as: number | null, isFinal = true) =>
    ({ week, homeTeamId: home, awayTeamId: away, homeScore: hs, awayScore: as, isFinal })

  test("wins, losses, points for and against come from final matchups", () => {
    const rows = computeStandings(["A", "B", "C"], [m(1, "A", "B", 100, 80), m(2, "C", "A", 90, 95)], 3)
    const a = rows.find((row) => row.teamId === "A")!
    expect(a).toMatchObject({ wins: 2, losses: 0, pointsFor: 195, pointsAgainst: 170, streak: "2W" })
    const b = rows.find((row) => row.teamId === "B")!
    expect(b).toMatchObject({ wins: 0, losses: 1, pointsFor: 80, pointsAgainst: 100, streak: "1L" })
    expect(rows[0].teamId).toBe("A")
  })

  test("the in-progress week does not count until it is final", () => {
    const rows = computeStandings(["A", "B"], [m(3, "A", "B", 40, 10, false)], 3)
    expect(rows.every((row) => row.wins === 0 && row.losses === 0)).toBe(true)
  })

  test("a past week with recorded scores is not counted before finalization", () => {
    const pending = m(1, "A", "B", 20, 10, false)
    expect(isCompletedMatchup(pending, 3)).toBe(false)
    const rows = computeStandings(["A", "B"], [pending], 3)
    expect(rows.find((row) => row.teamId === "A")!.wins).toBe(0)
    expect(rows.find((row) => row.teamId === "B")!.losses).toBe(0)
  })

  test("matchups without scores never count", () => {
    expect(isCompletedMatchup(m(1, "A", "B", null, null, true), 3)).toBe(false)
  })

  test("ties are tracked separately and break the streak", () => {
    const rows = computeStandings(["A", "B"], [m(1, "A", "B", 10, 10), m(2, "A", "B", 12, 5)], 3)
    const a = rows.find((row) => row.teamId === "A")!
    expect(a).toMatchObject({ wins: 1, ties: 1, losses: 0, streak: "1W" })
  })

  test("tie-break order: wins, then fewer losses, then points for", () => {
    const rows = computeStandings(["A", "B", "C"], [m(1, "A", "C", 50, 10), m(1, "B", "C", 70, 10)], 3)
    expect(rows.map((row) => row.teamId).slice(0, 2)).toEqual(["B", "A"])
  })

  test("streak counts consecutive latest results", () => {
    const rows = computeStandings(["A", "B"], [m(1, "A", "B", 1, 9), m(2, "A", "B", 9, 1), m(3, "A", "B", 9, 1)], 4)
    expect(rows.find((row) => row.teamId === "A")!.streak).toBe("2W")
  })
})

test.describe("roster swap eligibility", () => {
  test("a defenseman leaving IR cannot take the goalie slot he was swapped with", () => {
    expect(positionFitsSlot("G", "D")).toBe(false)
    expect(displacedLandingSlot("G", "D", true)).toBe("BN")
    expect(displacedLandingSlot("G", "D", false)).toBeNull()
  })

  test("a player who can play the vacated slot takes it, including flex", () => {
    expect(displacedLandingSlot("G", "G", false)).toBe("G")
    expect(displacedLandingSlot("C", "C", false)).toBe("C")
    expect(displacedLandingSlot("F", "LW", false)).toBe("F")
    expect(displacedLandingSlot("W", "C", true)).toBe("BN")
  })
})

test.describe("trade roster projection", () => {
  const roster = [
    { teamId: "A", playerId: 1, slot: "C" },
    { teamId: "A", playerId: 2, slot: "BN" },
    { teamId: "B", playerId: 3, slot: "D" },
  ]
  test("incoming players occupy bench; outgoing players are removed", () => {
    const result = previewPlayerTransfers(roster, ["A", "B"], [
      { fromTeamId: "A", toTeamId: "B", playerId: 1 },
      { fromTeamId: "B", toTeamId: "A", playerId: 3 },
    ], "BN")
    expect(result.get("A")).toEqual([{ playerId: 2, slot: "BN" }, { playerId: 3, slot: "BN" }])
    expect(result.get("B")).toEqual([{ playerId: 1, slot: "BN" }])
    expect(roster[0].slot).toBe("C") // projection must not mutate the source
  })
  test("rejects duplicate player transfers before any database write", () => {
    expect(() => previewPlayerTransfers(roster, ["A", "B"], [
      { fromTeamId: "A", toTeamId: "B", playerId: 1 },
      { fromTeamId: "A", toTeamId: "B", playerId: 1 },
    ], "BN")).toThrow(/Duplicate or unavailable/)
  })
})

test.describe("waiver bench acquisition", () => {
  const players = (slots: string[]) => slots.map((slot, index) => ({ playerId: index + 1, slot }))

  test("rejects a full bench even when active roster capacity remains", () => {
    const roster = players(["BN", "BN", "C", "W"])
    expect(hasRoomForBenchAcquisition(roster, 6, 2)).toBe(false)
    expect(hasRoomForBenchAcquisition(roster, 6, 2, 3)).toBe(false) // dropping a starter frees no bench spot
    expect(hasRoomForBenchAcquisition(roster, 6, 2, 1)).toBe(true)
  })

  test("checks active roster cap, excluding the reserve slots", () => {
    const roster = players(["C", "BN", "TAXI", "IR"])
    expect(hasRoomForBenchAcquisition(roster, 2, 2)).toBe(false)
    expect(hasRoomForBenchAcquisition(roster, 2, 2, 1)).toBe(true)
    expect(hasRoomForBenchAcquisition(roster, 2, 2, 3)).toBe(false)
  })

  test("rejects invalid bench capacity configuration", () => {
    expect(hasRoomForBenchAcquisition(players([]), 27, 0)).toBe(false)
  })
})

test.describe("lineup lock modes", () => {
  const weekly = (weekStarted: boolean): LockContext => ({ mode: "WEEKLY", weekStarted, startedTeams: new Set() })
  const daily = (teams: string[]): LockContext => ({ mode: "DAILY", weekStarted: false, startedTeams: new Set(teams) })

  test("weekly: nothing is locked before the first game of the week", () => {
    for (const slot of ["C", "W", "F", "D", "G", "BN", "IR", "TAXI"]) expect(isSlotLocked(weekly(false), slot, "MTL")).toBe(false)
  })

  test("weekly: once the first game starts every starter is locked for the whole week, whatever team they play for", () => {
    for (const slot of ["C", "W", "F", "D", "G"]) {
      expect(isSlotLocked(weekly(true), slot, "MTL")).toBe(true)
      expect(isSlotLocked(weekly(true), slot, "VGK")).toBe(true)
    }
  })

  test("weekly: bench, IR and taxi stay movable after the lock", () => {
    for (const slot of ["BN", "IR", "IR_PLUS", "TAXI"]) expect(isSlotLocked(weekly(true), slot, "MTL")).toBe(false)
  })

  test("daily: only players whose team already started playing today are locked", () => {
    expect(isSlotLocked(daily(["MTL"]), "C", "MTL")).toBe(true)
    expect(isSlotLocked(daily(["MTL"]), "BN", "MTL")).toBe(true)
    expect(isSlotLocked(daily(["MTL"]), "C", "TOR")).toBe(false)
  })

  test("the week has started once any game's puck has dropped", () => {
    const now = new Date("2026-10-12T20:00:00Z")
    expect(hasWeekStarted([new Date("2026-10-12T23:00:00Z")], now)).toBe(false)
    expect(hasWeekStarted([new Date("2026-10-12T23:00:00Z"), new Date("2026-10-12T19:00:00Z")], now)).toBe(true)
    expect(hasWeekStarted([], now)).toBe(false)
  })

  test("lock mode defaults to weekly and only accepts WEEKLY or DAILY", () => {
    expect(normalizeLockMode(undefined)).toBe("WEEKLY")
    expect(normalizeLockMode("garbage")).toBe("WEEKLY")
    expect(normalizeLockMode("DAILY")).toBe("DAILY")
    expect(isStarterSlot("F")).toBe(true)
    expect(isStarterSlot("BN")).toBe(false)
  })
})

test.describe("historical scoring snapshot coverage", () => {
  test("requires every matchup team, not merely one existing lineup row", () => {
    const required = ["home", "away"]
    expect(missingSnapshotTeamIds(required, [])).toEqual(required)
    expect(missingSnapshotTeamIds(required, [{ teamId: "home" }])).toEqual(["away"])
    expect(missingSnapshotTeamIds(required, [{ teamId: "home" }, { teamId: "away" }])).toEqual([])
  })

  test("deduplicates repeated matchups and does not infer coverage from a different team", () => {
    expect(missingSnapshotTeamIds(["home", "away", "home"], [{ teamId: "other" }, { teamId: "home" }])).toEqual(["away"])
  })
})

test.describe("future-week lineup plan validation", () => {
  const limits = {
    rosterPositions: { C: 1, W: 0, F: 0, D: 0, G: 0, BN: 1 },
    rosterSize: 2, taxiSlots: 0, irSlots: 0, taxiMaxGames: 50,
  }
  const player = (name: string) => ({ name, position: "C", injuryStatus: PlayerStatus.HEALTHY, nhlGamesPlayed: 12 })
  const roster = [
    { playerId: 1, slot: SlotType.BN, player: player("First") },
    { playerId: 2, slot: SlotType.C, player: player("Second") },
  ]

  test("moves a future starter with legal displacement without mutating its live source", () => {
    const planned = previewFutureMove(roster, limits, 1, SlotType.C, 2)
    expect(planned.map((row) => row.slot)).toEqual([SlotType.C, SlotType.BN])
    expect(roster.map((row) => row.slot)).toEqual([SlotType.BN, SlotType.C])
  })

  test("rejects invalid position, IR and full-bench moves before save", () => {
    expect(() => previewFutureMove(roster, limits, 1, SlotType.G)).toThrow(/not an enabled slot|cannot play/)
    expect(() => previewFutureMove(roster, limits, 1, SlotType.IR)).toThrow(/not eligible/)
    expect(() => previewFutureMove(roster, limits, 2, SlotType.BN)).toThrow(/Bench is full/)
  })

  test("detects transfers that invalidate saved ownership rather than guessing lineup intent", () => {
    expect(rosterMatchesPlan([{ playerId: 1 }, { playerId: 2 }], [{ playerId: 2 }, { playerId: 1 }])).toBe(true)
    expect(rosterMatchesPlan([{ playerId: 1 }, { playerId: 3 }], [{ playerId: 1 }, { playerId: 2 }])).toBe(false)
    expect(rosterMatchesPlan([{ playerId: 1 }, { playerId: 1 }], [{ playerId: 1 }, { playerId: 2 }])).toBe(false)
  })
})

test.describe("DAILY-mode game-scoped scoring", () => {
  test("credits a player to different owners in different NHL games without retroactive ownership changes", () => {
    const slots = [
      { gameId: 100, teamId: "before-trade", playerId: 7, slot: "C" },
      { gameId: 101, teamId: "after-trade", playerId: 7, slot: "C" },
      { gameId: 101, teamId: "before-trade", playerId: 8, slot: "BN" },
    ]
    const stats = [
      { gameId: 100, playerId: 7, ...stat({ goals: 1 }) },
      { gameId: 101, playerId: 7, ...stat({ assists: 1 }) },
      { gameId: 101, playerId: 8, ...stat({ goals: 10 }) },
    ]
    const scored = scoreTeamsByGame(slots, stats, DEFAULT_LEAGUE_SCORING)
    expect(scored.get("before-trade")).toBe(DEFAULT_LEAGUE_SCORING.goal)
    expect(scored.get("after-trade")).toBe(DEFAULT_LEAGUE_SCORING.assist)
  })

  test("requires a snapshot header from every fantasy team for every started game", () => {
    const coverage = [
      { gameId: 100, teamId: "A" }, { gameId: 100, teamId: "B" },
      { gameId: 101, teamId: "A" },
    ]
    expect(missingDailyGameCoverage([100, 101], ["A", "B"], coverage)).toEqual([{ gameId: 101, teamId: "B" }])
    expect(missingDailyGameCoverage([100], ["A", "B"], coverage)).toEqual([])
    expect(missingDailyGameCoverage([], ["A", "B"], [])).toEqual([])
  })
})
