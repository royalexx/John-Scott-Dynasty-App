import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs"
import path from "node:path"

export const runtime = "nodejs"

// Resolved headshots, including NHL search misses that are not in the local file.
const idCache = new Map<string, string>()
let nhlIdByName: Map<string, number> | null = null

function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

function loadNhlIdByName(): Map<string, number> | null {
  if (nhlIdByName) return nhlIdByName
  const filePath = path.join(process.cwd(), "public", "data", "nhl-players.json")
  if (!fs.existsSync(filePath)) return null
  const players = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Array<{ name?: string; nhlId?: number }>
  const index = new Map<string, number>()
  for (const player of players) {
    const nhlId = player.nhlId
    if (!player.name || nhlId == null || !Number.isFinite(nhlId)) continue
    const key = normalizeName(player.name)
    if (!index.has(key)) index.set(key, nhlId)
  }
  nhlIdByName = index
  return index
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const name = searchParams.get("name")?.trim()

  if (!name) {
    return new NextResponse(null, { status: 404 })
  }

  const cleanName = normalizeName(name)

  if (idCache.has(cleanName)) {
    const cachedId = idCache.get(cleanName)!
    return NextResponse.redirect(`https://assets.nhle.com/mugs/nhl/latest/${cachedId}.png`, {
      headers: { "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400" },
    })
  }

  const indexedId = loadNhlIdByName()?.get(cleanName)
  if (indexedId != null) {
    const playerId = String(indexedId)
    idCache.set(cleanName, playerId)
    return NextResponse.redirect(`https://assets.nhle.com/mugs/nhl/latest/${playerId}.png`, {
      headers: { "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400" },
    })
  }

  try {
    const nhlRes = await fetch(
      `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=1&q=${encodeURIComponent(cleanName)}&active=true`,
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" }, next: { revalidate: 86400 } }
    )

    if (nhlRes.ok) {
      const data = await nhlRes.json()
      const player = data?.[0]
      if (player?.playerId) {
        idCache.set(cleanName, String(player.playerId))
        return NextResponse.redirect(`https://assets.nhle.com/mugs/nhl/latest/${player.playerId}.png`, {
          headers: { "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400" },
        })
      }
    }
  } catch {
    // The generic portrait below is the intentional fallback when NHL lookup fails.
  }

  return new NextResponse(null, { status: 404 })
}