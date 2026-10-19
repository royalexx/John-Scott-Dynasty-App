import { getLeague, getLeagueStandings } from "@/lib/db/leagues"
import { getTeamDraftPickInventory } from "@/lib/db/picks"
import { getTeamRoster } from "@/lib/db/rosters"
import { initialDashboardData } from "@/lib/dashboard-data"
import { getLockSummary } from "@/lib/services/lineup-locks"
import { getCurrentFantasyWeek, getFantasyWeekDates } from "@/lib/season-calendar"
import { getPlayerSchedule, type NhlScheduleGame, type Player, type PlayerGameLog } from "@/lib/hockey-data"
import { prisma } from "@/lib/prisma"
import { formatActivity } from "@/lib/activity-format"
import { getManagerSession } from "@/lib/auth-session"
import { PinGate, type PinGateTeam } from "@/components/auth/pin-gate"
import DashboardClient from "./dashboard-client"

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

export const dynamic = "force-dynamic"

export default async function Page() {
  try {
    const league = await getLeague("00000000-0000-0000-0000-000000000001")
    if (!league) return <DashboardClient initialData={initialDashboardData} />

    const gateTeams: PinGateTeam[] = league.teams.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      managerId: candidate.manager.id,
      managerName: candidate.manager.name,
      managerHandle: candidate.manager.handle,
      isCommissioner: candidate.manager.isCommissioner,
      avatarUrl: candidate.manager.avatarUrl,
    }))
    const session = await getManagerSession()
    const team = session
      ? league.teams.find((candidate) => candidate.id === session?.teamId && candidate.managerId === session?.managerId)
      : undefined
    if (!team) return <PinGate teams={gateTeams} />

    const [rosterSlots, leagueStandings, pickInventory, activityRecords, allRosterSlots, matchupRows, lockSummary] = await Promise.all([
      getTeamRoster(team.id),
      getLeagueStandings(league.id, league.currentSeason),
      getTeamDraftPickInventory(team.id),
      prisma.activityLog.findMany({
        where: { leagueId: league.id },
        include: { team: { select: { name: true, manager: { select: { name: true, handle: true } } } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.rosterSlot.findMany({ where: { team: { leagueId: league.id } }, select: { playerId: true, slot: true, team: { select: { name: true } } } }),
      prisma.matchup.findMany({
        where: { leagueId: league.id, season: league.currentSeason, week: { lte: getCurrentFantasyWeek(league.currentSeason) } },
        select: { week: true, homeScore: true, awayScore: true, isFinal: true, homeTeam: { select: { name: true } }, awayTeam: { select: { name: true } } },
        orderBy: { week: "asc" },
      }),
      getLockSummary(league.currentSeason, league.lineupLockMode),
    ])
    const leagueRosters: Record<string, Array<{ nhlId: number; slot: string }>> = {}
    for (const entry of allRosterSlots) (leagueRosters[entry.team.name] ??= []).push({ nhlId: entry.playerId, slot: entry.slot })
    const { dates: fantasyWeekDates } = getFantasyWeekDates(getCurrentFantasyWeek(), league.currentSeason)
    const scheduleRecords = await prisma.nhlGame.findMany({
      where: { gameDate: { in: fantasyWeekDates } },
      orderBy: { startTimeUTC: "asc" },
    })
    const rosterPlayerIds = rosterSlots.map((slot) => slot.player.id)
    const playerGameStats = await prisma.playerGameStat.findMany({
      where: {
        playerId: { in: rosterPlayerIds },
        gameId: { in: scheduleRecords.map((game) => game.id) },
      },
    })
    const scheduleGames: NhlScheduleGame[] = scheduleRecords.map((game) => ({
      id: game.id,
      date: game.gameDate,
      day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${game.gameDate}T12:00:00Z`)),
      gameState: game.gameState,
      startTimeUTC: game.startTimeUTC.toISOString(),
      awayTeam: { abbrev: game.awayTeamAbbrev, score: game.awayScore },
      homeTeam: { abbrev: game.homeTeamAbbrev, score: game.homeScore },
    }))
    const logsByPlayer = new Map<number, PlayerGameLog[]>()
    const gamesById = new Map(scheduleRecords.map((game) => [game.id, game]))
    const weekPointsByPlayer = new Map<number, number>()
    for (const stat of playerGameStats) {
      const game = gamesById.get(stat.gameId)
      if (!game) continue
      weekPointsByPlayer.set(stat.playerId, (weekPointsByPlayer.get(stat.playerId) ?? 0) + stat.fantasyPoints)
        const logs = logsByPlayer.get(stat.playerId) ?? []
        logs.push({
          gameId: game.id,
          gameDate: game.gameDate,
          goals: stat.goals,
          assists: stat.assists,
          shots: stat.shots,
          hits: stat.hits,
          blocks: stat.blocks,
          pim: stat.pim,
          points: stat.goals + stat.assists,
          plusMinus: stat.plusMinus,
          powerPlayPoints: stat.powerPlayPoints,
          shorthandedGoals: stat.shorthandedGoals,
          gameWinningGoals: stat.gameWinningGoals,
          toi: stat.toi,
          decision: stat.decision,
          shotsAgainst: stat.shotsAgainst,
          goalsAgainst: stat.goalsAgainst,
          savePctg: stat.savePct,
          shutouts: stat.shutouts,
        })
        logsByPlayer.set(stat.playerId, logs)
    }

    const fantasyWeek = getCurrentFantasyWeek()
    const roster: Player[] = rosterSlots.map((slot) => {
      const status = slot.player.injuryStatus === "HEALTHY" ? null : slot.player.injuryStatus
      const playerLogs = logsByPlayer.get(slot.player.id) ?? []
      const calculatedSchedule = getPlayerSchedule(slot.player.teamAbbrev, scheduleGames, playerLogs, slot.player.position, undefined, 0, fantasyWeek)
      const schedule = calculatedSchedule ?? {
        week: fantasyWeek,
        day: "—",
        date: fantasyWeekDates[0],
        time: "—",
        status: "Scheduled" as const,
        opponent: "—",
        home: false,
        weekFantasyPoints: 0,
        weekProjectedFantasyPoints: 0,
        weekGamesPlayed: 0,
        weekGamesScheduled: 0,
        todayFantasyPoints: null,
        isToday: false,
      }
      schedule.weekFantasyPoints = Number((weekPointsByPlayer.get(slot.player.id) ?? 0).toFixed(1))
      schedule.weekGamesPlayed = playerLogs.filter((game) => game.gameDate >= fantasyWeekDates[0] && game.gameDate <= fantasyWeekDates[fantasyWeekDates.length - 1]).length
      return {
        id: `nhl-${slot.player.id}`,
        nhlId: slot.player.id,
        name: slot.player.name,
        position: slot.player.position,
        slot: slot.slot === "IR_PLUS" ? "IR" : slot.slot,
        team: slot.player.teamAbbrev,
        opponent: schedule?.opponent ?? "—",
        gameTime: schedule ? `${schedule.day} ${schedule.time}` : "—",
        status,
        todayPts: schedule.todayFantasyPoints,
        projPts: schedule.weekProjectedFantasyPoints,
        schedule,
        gameLog: playerLogs,
        nhlGamesPlayed: slot.player.nhlGamesPlayed,
        headshot: slot.player.headshotUrl ?? undefined,
      }
    })

    return (
      <DashboardClient
        initialData={{
          ...initialDashboardData,
          leagueId: league.id,
          teamId: team.id,
          managerHandle: team.manager.handle,
          isCommissioner: session?.isCommissioner ?? false,
          teamName: team.name,
          teamLogo: team.logoUrl ?? undefined,
          userFaab: team.faabBalance,
          waiverPriority: team.waiverPriority,
          leagueRosters,
          matchupResults: matchupRows.map((row) => ({ week: row.week, homeTeam: row.homeTeam.name, awayTeam: row.awayTeam.name, homeScore: Number(row.homeScore ?? 0), awayScore: Number(row.awayScore ?? 0), isFinal: row.isFinal })),
          lineupLock: { mode: lockSummary.mode, locked: lockSummary.locked, week: lockSummary.week, firstGameAt: lockSummary.firstGameAt, weekEndDate: lockSummary.weekEndDate },
          roster,
          standings: leagueStandings?.map((row, index) => ({
            rank: index + 1,
            delta: null,
            team: row.team.name,
            owner: `@${row.team.manager.handle}`,
            wins: row.wins,
            losses: row.losses,
            pointsFor: row.pointsFor,
            pointsAgainst: row.pointsAgainst,
            faabRemaining: row.team.faabBalance,
            streak: row.streak,
          })) ?? initialDashboardData.standings,
          activities: activityRecords.map(formatActivity),
          league: {
            rosterPositions: (league.rosterPositions as Record<string, number> | null) ?? undefined,
            scoringSettings: (league.scoringSettings as Record<string, unknown>) ?? undefined,
            waiverSettings: (league.waiverSettings as Record<string, unknown> | null) ?? undefined,
            tradeSettings: (league.tradeSettings as Record<string, unknown> | null) ?? undefined,
            draftSettings: (league.draftSettings as Record<string, unknown> | null) ?? undefined,
            rosterSize: league.rosterSize,
            taxiSlots: league.taxiSlots,
            taxiMaxGames: league.taxiMaxGames,
            irSlots: league.irSlots,
            lineupLockMode: league.lineupLockMode === "DAILY" ? "DAILY" : "WEEKLY",
            currentWeek: league.currentWeek,
          },
          draftPicks: pickInventory.owned.map((pick) => `${pick.season} ${getOrdinal(pick.round)} Round`),
          draftPickAssets: pickInventory.owned.map((pick) => ({
            id: pick.id,
            label: `${pick.season} ${getOrdinal(pick.round)} Round`,
            detail: `Originally owned by ${pick.originalTeam.name}`,
          })),
        }}
      />
    )
  } catch (error: unknown) {
    console.error("Database dashboard hydration failed; using placeholder data", error)
    return <DashboardClient initialData={initialDashboardData} />
  }
}
