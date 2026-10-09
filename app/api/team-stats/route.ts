import { NextResponse } from "next/server"

type Standing = {
  teamName?: { default?: string }
  teamAbbrev?: { default?: string }
  gamesPlayed?: number
  goalFor?: number
  goalAgainst?: number
  wins?: number
  losses?: number
  otLosses?: number
  points?: number
  pointPctg?: number
}

type TeamSummary = {
  teamFullName?: string
  goalsForPerGame?: number
  goalsAgainstPerGame?: number
  powerPlayPct?: number
  penaltyKillPct?: number
}

export async function GET(request: Request) {
  const team = new URL(request.url).searchParams.get("team")?.toUpperCase()
  if (!team) return NextResponse.json({ error: "Team abbreviation is required" }, { status: 400 })
  const [standingsResponse, statsResponse] = await Promise.all([
    fetch("https://api-web.nhle.com/v1/standings/now", {
      headers: { Accept: "application/json", "User-Agent": "JohnScottDynasty/1.0" },
      next: { revalidate: 300 },
    }),
    fetch("https://api.nhle.com/stats/rest/en/team/summary?isAggregate=false&isGame=false&start=0&limit=100&cayenneExp=seasonId=20262027", {
      headers: { Accept: "application/json", "User-Agent": "JohnScottDynasty/1.0" },
      next: { revalidate: 300 },
    }),
  ])
  if (!standingsResponse.ok || !statsResponse.ok) return NextResponse.json({ error: "NHL team statistics unavailable" }, { status: 502 })
  const data = await standingsResponse.json() as { standings?: Standing[] }
  const statsData = await statsResponse.json() as { data?: TeamSummary[] }
  const standings = data.standings ?? []
  const teamSummary = statsData.data ?? []
  const ranked = standings.map((entry) => {
    const summary = teamSummary.find((candidate) => candidate.teamFullName === entry.teamName?.default)
    return {
      ...entry,
      abbreviation: entry.teamAbbrev?.default ?? "",
      goalsForPerGame: summary?.goalsForPerGame ?? (entry.goalFor ?? 0) / Math.max(1, entry.gamesPlayed ?? 0),
      goalsAgainstPerGame: summary?.goalsAgainstPerGame ?? (entry.goalAgainst ?? 0) / Math.max(1, entry.gamesPlayed ?? 0),
      powerPlayPct: summary?.powerPlayPct ?? null,
      penaltyKillPct: summary?.penaltyKillPct ?? null,
    }
  })
  const current = ranked.find((entry) => entry.abbreviation === team)
  if (!current) return NextResponse.json({ error: `Team ${team} not found` }, { status: 404 })
  const offenseRank = [...ranked].sort((a, b) => b.goalsForPerGame - a.goalsForPerGame).findIndex((entry) => entry.abbreviation === team) + 1
  const defenseRank = [...ranked].sort((a, b) => a.goalsAgainstPerGame - b.goalsAgainstPerGame).findIndex((entry) => entry.abbreviation === team) + 1
  return NextResponse.json({
    source: "NHL standings",
    team,
    record: `${current.wins ?? 0}-${current.losses ?? 0}-${current.otLosses ?? 0}`,
    points: current.points ?? 0,
    pointPct: current.pointPctg ?? 0,
    goalsForPerGame: Number(current.goalsForPerGame.toFixed(2)),
    goalsAgainstPerGame: Number(current.goalsAgainstPerGame.toFixed(2)),
    offenseRank,
    defenseRank,
    powerPlay: current.powerPlayPct == null ? null : Number((current.powerPlayPct * 100).toFixed(1)),
    penaltyKill: current.penaltyKillPct == null ? null : Number((current.penaltyKillPct * 100).toFixed(1)),
  })
}
