import { NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

function normalizePlayer(player: Record<string, unknown>) {
  const position = player.position === "LW" || player.position === "RW" || player.position === "D" || player.position === "G" || player.position === "C"
    ? player.position
    : "C"
  const goalie = position === "G"
  const injuryStatus = player.injuryStatus === "IR" || player.injuryStatus === "DTD" || player.injuryStatus === "O"
    ? player.injuryStatus
    : null
  return {
    rank: 0,
    name: String(player.name ?? "Unknown Player"),
    position,
    team: String(player.team ?? "NHL"),
    waiver: String(player.waiver ?? "FA"),
    velocity: "0",
    rostered: "0%",
    trend: "steady",
    fpts: Number(player.fpts ?? player.projPts ?? 0),
    projection: Number(player.projection ?? player.projPts ?? 0),
    gp: Math.max(1, Number(player.gp ?? 82)),
    goals: Number(player.goals ?? 0),
    assists: Number(player.assists ?? 0),
    sog: Number(player.sog ?? 0),
    hits: Number(player.hits ?? 0),
    blocks: Number(player.blocks ?? 0),
    adp: Number(player.adp ?? 999),
    ...(goalie ? {
      wins: Number(player.wins ?? 0),
      saves: Number(player.saves ?? 0),
      shutouts: Number(player.shutouts ?? 0),
      savePct: Number(player.savePct ?? 0.915),
    } : {}),
    nhlId: Number(player.nhlId),
    headshot: String(player.headshot ?? `https://assets.nhle.com/mugs/nhl/latest/${player.nhlId}.png`),
    id: String(player.id ?? `nhl-${player.nhlId}`),
    slot: player.slot,
    projPts: Number(player.projPts ?? 0),
    todayPts: player.todayPts ?? null,
    opponent: String(player.opponent ?? "—"),
    profile: player.profile,
    currentSeasonStats: player.currentSeasonStats,
    gameLog: player.gameLog,
    historicalSeasons: player.historicalSeasons,
    nhlGamesPlayed: typeof player.nhlGamesPlayed === "number" ? player.nhlGamesPlayed : undefined,
    injuryStatus,
    injuryVerification: player.injuryVerification,
    injurySources: player.injurySources,
  }
}

export async function GET() {
  const filePath = path.join(process.cwd(), "public", "data", "nhl-players.json")

  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>[]
    return NextResponse.json(data.map(normalizePlayer), {
      headers: { "Cache-Control": "no-store" },
    })
  }

  // Fallback: Fetch directly if JSON file is not yet built
  try {
    const res = await fetch(
      "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5000&q=*&active=true",
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } }
    )
    const data = await res.json()
    const players = (data ?? []).map((p: Record<string, unknown>) => normalizePlayer({
      id: `nhl-${p.playerId}`,
      nhlId: Number(p.playerId),
      name: p.name,
      team: p.teamAbbrev || p.lastTeamAbbrev || "NHL",
      position: p.positionCode === "L" ? "LW" : p.positionCode === "R" ? "RW" : p.positionCode || "C",
      slot: p.positionCode === "D" ? "D" : p.positionCode === "G" ? "G" : "W",
      projPts: 10.0,
      todayPts: null,
      waiver: "FA",
      opponent: "—",
      headshot: `https://assets.nhle.com/mugs/nhl/latest/${p.playerId}.png`,
    }))

    return NextResponse.json(players, {
      headers: { "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200" },
    })
  } catch (err) {
    return NextResponse.json({ error: "Failed to load players" }, { status: 500 })
  }
}