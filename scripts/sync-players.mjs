import fs from "node:fs"
import path from "node:path"

const OUTPUT_PATH = path.join(process.cwd(), "public", "data", "nhl-players.json")
const PROFILE_LIMIT = 150
const CURRENT_SEASON = 20262027
const PRIORITY_NAMES = new Set([
  "Nathan MacKinnon", "Auston Matthews", "Elias Pettersson", "Jack Eichel", "Leon Draisaitl",
  "Mitch Marner", "Cale Makar", "Quinn Hughes", "Adam Fox", "Rasmus Dahlin", "Miro Heiskanen",
  "Victor Hedman", "Igor Shesterkin", "Andrei Vasilevskiy", "Tim Stützle", "Trevor Zegras",
  "Owen Power", "Matvei Michkov", "Lane Hutson", "Connor Bedard", "Macklin Celebrini",
  "Dustin Wolf", "Logan Stankoven", "Will Smith", "Cutter Gauthier", "Rutger McGroarty", "Shane Wright",
  "Connor McDavid", "Jack Hughes",
  "Artemi Panarin", "David Pastrnak", "Kirill Kaprizov", "Mikko Rantanen", "Jason Robertson", "Brady Tkachuk",
  "Nick Suzuki", "Juraj Slafkovsky", "Juraj Slafkovský", "Trevor Connelly", "Aliaksei Protas",
])
const KNOWN_PLAYER_IDS = new Map([
  ["Tim Stutzle", 8482116],
  ["Juraj Slafkovsky", 8483515],
])

async function searchPlayerByName(name) {
  const url = `https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=10&q=${encodeURIComponent(name)}&active=true`
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } })
  if (!response.ok) throw new Error(`Player search failed for ${name}: ${response.status}`)
  const results = await response.json()
  return results.find((player) => player.name === name && player.playerId) ?? null
}

function normalizePosition(code) {
  if (code === "L") return "LW"
  if (code === "R") return "RW"
  if (code === "D") return "D"
  if (code === "G") return "G"
  return "C"
}

function calculateAge(birthDate) {
  if (!birthDate) return null
  const birth = new Date(`${birthDate}T00:00:00Z`)
  const now = new Date()
  let age = now.getUTCFullYear() - birth.getUTCFullYear()
  const birthdayPassed = now.getUTCMonth() > birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() >= birth.getUTCDate())
  if (!birthdayPassed) age -= 1
  return age
}

function formatHeight(inches) {
  if (!Number.isFinite(inches)) return null
  return `${Math.floor(inches / 12)}'${inches % 12}"`
}

function localized(value) {
  if (typeof value === "string") return value
  return value?.default ?? null
}

function normalizeInjuryStatus(value) {
  const status = localized(value)?.toUpperCase() ?? value?.abbreviation?.toUpperCase() ?? value?.name?.toUpperCase()
  if (!status) return null
  if (status.includes("IR") || status.includes("INJURED")) return "IR"
  if (status.includes("DTD") || status.includes("DAY-TO-DAY") || status.includes("DAY TO DAY")) return "DTD"
  if (status === "O" || status.includes("OUT")) return "O"
  return null
}

function normalizeName(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
}

async function fetchEspnInjuries() {
  const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries", {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  })
  if (!response.ok) throw new Error(`ESPN injury report failed: ${response.status}`)
  const data = await response.json()
  const injuries = new Map()
  for (const team of data.injuries ?? []) {
    for (const injury of team.injuries ?? []) {
      const name = injury.athlete?.displayName
      if (!name) continue
      const status = normalizeInjuryStatus(injury.type) ?? normalizeInjuryStatus(injury.status) ??
        normalizeInjuryStatus([injury.details, injury.shortComment, injury.longComment].filter(Boolean).join(" "))
      if (status) injuries.set(normalizeName(name), status)
    }
  }
  console.log(`🩺 Loaded ${injuries.size} ESPN injury designations.`)
  return injuries
}

async function enrichPlayer(player) {
  try {
    const response = await fetch(`https://api-web.nhle.com/v1/player/${player.nhlId}/landing`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    })
    if (!response.ok) return player
    const detail = await response.json()
    const draft = detail.draftDetails
    const stats = detail.featuredStats?.regularSeason?.subSeason
    const draftYear = draft?.year
    const seasonYear = Number(String(detail.featuredStats?.season ?? "").slice(0, 4))
    const experience = detail.yearsPro ?? detail.experience ?? (draftYear && seasonYear ? Math.max(0, seasonYear - draftYear) : null)
    const position = normalizePosition(detail.positionCode || (detail.position === "D" ? "D" : detail.position))
    const injuryStatus = normalizeInjuryStatus(detail.injuryStatus) ??
      normalizeInjuryStatus(detail.playerStatus) ??
      normalizeInjuryStatus(detail.status) ??
      player.injuryStatus ??
      null
    const gameLogResponse = await fetch(`https://api-web.nhle.com/v1/player/${player.nhlId}/game-log/${CURRENT_SEASON}/2`, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    })
    const gameLogData = gameLogResponse.ok ? await gameLogResponse.json() : null
    const gameLog = (gameLogData?.gameLog ?? []).map((game) => ({
      gameId: game.gameId,
      gameDate: game.gameDate,
      teamAbbrev: game.teamAbbrev,
      opponentAbbrev: game.opponentAbbrev,
      homeRoadFlag: game.homeRoadFlag,
      goals: game.goals ?? 0,
      assists: game.assists ?? 0,
      shots: game.shots ?? 0,
      hits: game.hits ?? 0,
      blocks: game.blocks ?? 0,
      pim: game.pim ?? 0,
      points: game.points ?? 0,
      plusMinus: game.plusMinus ?? 0,
      powerPlayPoints: game.powerPlayPoints ?? 0,
      shorthandedGoals: game.shorthandedGoals ?? 0,
      gameWinningGoals: game.gameWinningGoals ?? 0,
      toi: game.toi ?? "—",
      decision: game.decision ?? null,
      shotsAgainst: game.shotsAgainst ?? 0,
      goalsAgainst: game.goalsAgainst ?? 0,
      savePctg: game.savePctg ?? null,
      shutouts: game.shutouts ?? 0,
      powerPlayToi: game.powerPlayToi ?? "—",
      penaltyKillToi: game.shorthandedToi ?? "—",
    }))
    const historicalSeasons = (detail.seasonTotals ?? [])
      .filter((season) => season.gameTypeId === 2 && season.leagueAbbrev === "NHL")
      .map((season) => ({
        season: season.season,
        team: localized(season.teamName) ?? player.team,
        gamesPlayed: season.gamesPlayed ?? 0,
        goals: season.goals ?? 0,
        assists: season.assists ?? 0,
        points: season.points ?? 0,
        shots: season.shots ?? 0,
        pim: season.pim ?? 0,
        plusMinus: season.plusMinus ?? 0,
        wins: season.wins ?? 0,
        saves: season.saves ?? 0,
        goalsAgainst: season.goalsAgainst ?? 0,
        shutouts: season.shutouts ?? 0,
        savePctg: season.savePctg ?? null,
      }))
    const nhlGamesPlayed = detail.careerTotals?.regularSeason?.gamesPlayed ??
      historicalSeasons.reduce((total, season) => total + season.gamesPlayed, 0)
    const hits = gameLog.reduce((total, game) => total + (game.hits ?? 0), 0)
    const blocks = gameLog.reduce((total, game) => total + (game.blocks ?? 0), 0)
    const saves = gameLog.reduce((total, game) => total + ((game.shotsAgainst ?? 0) - (game.goalsAgainst ?? 0)), 0)
    const goalsAgainst = gameLog.reduce((total, game) => total + (game.goalsAgainst ?? 0), 0)
    const wins = gameLog.reduce((total, game) => total + (game.decision === "W" ? 1 : 0), 0)
    const shutouts = gameLog.reduce((total, game) => total + (game.shutouts ?? 0), 0)
    const shotsAgainst = gameLog.reduce((total, game) => total + (game.shotsAgainst ?? 0), 0)
    const savePct = shotsAgainst > 0 ? Number((saves / shotsAgainst).toFixed(3)) : 0
    return {
      ...player,
      hits,
      blocks,
      wins,
      saves,
      goalsAgainst,
      shutouts,
      savePct,
      team: detail.currentTeamAbbrev || player.team,
      position,
      slot: position === "LW" || position === "RW"
        ? "W"
        : position,
      profile: {
        sweaterNumber: detail.sweaterNumber ?? null,
        heightInInches: detail.heightInInches ?? null,
        height: formatHeight(detail.heightInInches),
        weightInPounds: detail.weightInPounds ?? null,
        birthDate: detail.birthDate ?? null,
        age: calculateAge(detail.birthDate),
        birthplace: [localized(detail.birthCity), localized(detail.birthStateProvince), localized(detail.birthCountry)].filter(Boolean).join(", ") || null,
        shoots: detail.shootsCatches ?? null,
        experience,
        draft: draft ? { year: draft.year, round: draft.round, pick: draft.overallPick ?? draft.pickInRound, team: draft.teamAbbrev ?? null } : null,
      },
      currentSeasonStats: stats ? {
        season: detail.featuredStats.season,
        gamesPlayed: stats.gamesPlayed ?? 0,
        goals: stats.goals ?? 0,
        assists: stats.assists ?? 0,
        points: stats.points ?? 0,
        shots: stats.shots ?? 0,
        powerPlayPoints: stats.powerPlayPoints ?? 0,
        shorthandedGoals: stats.shorthandedGoals ?? 0,
        gameWinningGoals: stats.gameWinningGoals ?? 0,
        pim: stats.pim ?? 0,
        plusMinus: stats.plusMinus ?? 0,
        hits,
        blocks,
        wins,
        saves,
        goalsAgainst,
        shutouts,
        savePct,
      } : null,
      gameLog,
      historicalSeasons,
      nhlGamesPlayed,
      injuryStatus,
    }
  } catch (error) {
    console.warn(`Profile enrichment failed for ${player.name}: ${error.message}`)
    return player
  }
}

async function fetchDynastyPool() {
  console.log("🏒 Fetching complete NHL player & prospect pool...")
  const playerMap = new Map()
  let espnInjuryMap = new Map()
  try {
    espnInjuryMap = await fetchEspnInjuries()
  } catch (error) {
    console.warn(`ESPN injury sync failed: ${error.message}`)
  }

  // Use the active index so retired players are not imported from NHL search history.
  try {
    const res = await fetch(
      "https://search.d3.nhle.com/api/v1/search/player?culture=en-us&limit=5000&q=*&active=true",
      { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } }
    )
    if (res.ok) {
      const data = await res.json()
      for (const p of data) {
        if (!p.playerId || !p.name) continue
        const position = normalizePosition(p.positionCode)
        playerMap.set(String(p.playerId), {
          id: `nhl-${p.playerId}`,
          nhlId: Number(p.playerId),
          name: p.name,
          team: p.teamAbbrev || p.lastTeamAbbrev || "NHL",
          position,
          slot: position === "LW" || position === "RW" ? "W" : position,
          projPts: position === "G" ? 12.5 : position === "D" ? 9.8 : 11.2,
          todayPts: null,
          waiver: "FA",
          opponent: "—",
          headshot: `https://assets.nhle.com/mugs/nhl/latest/${p.playerId}.png`,
          injuryStatus: normalizeInjuryStatus(p.injuryStatus ?? p.status),
        })
      }
      console.log(`✅ Loaded ${playerMap.size} NHL database players.`)
    }
  } catch (err) {
    console.error("Failed to fetch active player index:", err)
  }

  const missingPriorityNames = [...PRIORITY_NAMES].filter((name) => ![...playerMap.values()].some((player) => player.name === name))
  for (const name of missingPriorityNames) {
    try {
      const player = await searchPlayerByName(name)
      const fallbackId = KNOWN_PLAYER_IDS.get(name)
      if (!player && fallbackId) {
        playerMap.set(String(fallbackId), {
          id: `nhl-${fallbackId}`,
          nhlId: fallbackId,
          name,
          team: "OTT",
          position: "C",
          slot: "C",
          projPts: 11.2,
          todayPts: null,
          waiver: "FA",
          opponent: "—",
          headshot: `https://assets.nhle.com/mugs/nhl/latest/${fallbackId}.png`,
        })
        continue
      }
      if (!player) {
        console.warn(`No exact NHL search result found for ${name}`)
        continue
      }
      const position = normalizePosition(player.positionCode)
      playerMap.set(String(player.playerId), {
        id: `nhl-${player.playerId}`,
        nhlId: Number(player.playerId),
        name: player.name,
        team: player.teamAbbrev || player.lastTeamAbbrev || "NHL",
        position,
        slot: position === "LW" || position === "RW" ? "W" : position,
        projPts: position === "G" ? 12.5 : position === "D" ? 9.8 : 11.2,
        todayPts: null,
        waiver: "FA",
        opponent: "—",
        headshot: `https://assets.nhle.com/mugs/nhl/latest/${player.playerId}.png`,
      })
    } catch (error) {
      console.warn(`Exact NHL search failed for ${name}: ${error.message}`)
    }
  }
  for (const [name, nhlId] of KNOWN_PLAYER_IDS) {
    if (![...playerMap.values()].some((player) => player.name === name)) {
      playerMap.set(String(nhlId), {
        id: `nhl-${nhlId}`,
        nhlId,
        name,
        team: "OTT",
        position: "C",
        slot: "C",
        projPts: 11.2,
        todayPts: null,
        waiver: "FA",
        opponent: "—",
        headshot: `https://assets.nhle.com/mugs/nhl/latest/${nhlId}.png`,
      })
    }
  }

  const allPlayers = Array.from(playerMap.values())
    .map((player) => {
      const status = espnInjuryMap.get(normalizeName(player.name)) ?? player.injuryStatus ?? null
      return {
        ...player,
        injuryStatus: status,
        injuryVerification: status ? "single-source" : null,
        injurySources: status ? ["ESPN"] : [],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
  const priorityPlayers = allPlayers.filter((player) => PRIORITY_NAMES.has(player.name) || [...KNOWN_PLAYER_IDS.values()].includes(player.nhlId))
  const profileTargets = [...new Map([...priorityPlayers, ...allPlayers].map((player) => [player.nhlId, player])).values()].slice(0, PROFILE_LIMIT)
  console.log(`🔎 Enriching ${profileTargets.length} relevant players with NHL profiles and current-season stats...`)
  for (let index = 0; index < profileTargets.length; index += 8) {
    const batch = profileTargets.slice(index, index + 8)
    const enriched = await Promise.all(batch.map(enrichPlayer))
    enriched.forEach((player) => playerMap.set(String(player.nhlId), player))
  }
  for (const [name, nhlId] of KNOWN_PLAYER_IDS) {
    const player = playerMap.get(String(nhlId))
    if (player) player.name = name
  }
  const enrichedPlayers = Array.from(playerMap.values())
    .map((player) => {
      const status = espnInjuryMap.get(normalizeName(player.name)) ?? player.injuryStatus ?? null
      return {
        ...player,
        injuryStatus: status,
        injuryVerification: status ? "single-source" : null,
        injurySources: status ? ["ESPN"] : [],
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true })
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enrichedPlayers, null, 2))
  console.log(`🎉 Saved ${enrichedPlayers.length} total dynasty players to public/data/nhl-players.json`)
}

fetchDynastyPool()