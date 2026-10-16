"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ChevronLeft, ChevronRight, Filter, SlidersHorizontal, Trophy, X } from "lucide-react"
import {
  activities as defaultActivities,
  getTeamRoster,
  getWeekActualPoints,
  getWeekMatchups,
  getWeekProjectedPoints,
  isStarterSlot,
  roster as defaultRoster,
  standings as defaultStandings,
  type ActivityItem,
  type LiveMatchupSummary,
  type MatchupSummary,
  type MarketPlayer,
  type Player,
  type StandingRow,
} from "@/lib/hockey-data"
import type { MatchupResult } from "@/lib/dashboard-data"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { SwipeSurface } from "@/components/hockey/swipe-gestures"
import { cn } from "@/lib/utils"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { DraftCard } from "@/components/hockey/draft-room"
import { buildPlayoffBracket, type BracketGame } from "@/lib/playoff-bracket"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"

type ActivityFilter = "ALL" | "TRADE" | "ADD" | "DROP"
type DisplayMatchup = MatchupSummary & Partial<Pick<LiveMatchupSummary, "projectedHome" | "projectedAway">>
type FeedProps = {
  matchupResults?: MatchupResult[]
  week?: number
  teamName?: string
  teamLogo?: string
  standings?: StandingRow[]
  liveMatchups?: Record<string, LiveMatchupSummary>
  activities?: ActivityItem[]
  roster?: Player[]
  players?: MarketPlayer[]
  isCommissioner?: boolean
  onWeekChange?: (week: number) => void
  onSelectMatchup?: (matchupId: string) => void
  onSelectPlayer?: (player: Player) => void
  onTrade?: (team: StandingRow) => void
  onSettings?: () => void
}

const starterSlots = ["C", "C", "C", "W", "W", "W", "W", "W", "W", "F", "F", "F", "D", "D", "D", "D", "D", "D", "G", "G"] as const
const badgeColors: Record<string, string> = { C: "bg-blue-500", W: "bg-teal-500", F: "bg-violet-500", D: "bg-amber-500", G: "bg-sky-300 text-slate-900" }

function calculateRosterSummary(team: string, roster: Player[], players: MarketPlayer[], week: number) {
  return getTeamRoster(team, roster, players)
    .filter((player) => isStarterSlot(player.slot))
    .reduce(
      (summary, player) => ({
        score: summary.score + getWeekActualPoints(player, week),
        projected: summary.projected + (getWeekProjectedPoints(player, week) ?? 0),
      }),
      { score: 0, projected: 0 },
    )
}

function getWeeklyRecords(week: number, results: MatchupResult[]) {
    const records = new Map<string, { wins: number; losses: number }>()
    const ensure = (team: string) => {
      if (!records.has(team)) records.set(team, { wins: 0, losses: 0 })
      return records.get(team)!
    }
    for (const matchup of results) {
      if (!matchup.isFinal || matchup.week >= week) continue
      const home = ensure(matchup.homeTeam)
      const away = ensure(matchup.awayTeam)
      if (matchup.homeScore > matchup.awayScore) {
        home.wins += 1
        away.losses += 1
      } else if (matchup.awayScore > matchup.homeScore) {
        away.wins += 1
        home.losses += 1
      }
    }
    return records
}

function recordFor(team: string, records: Map<string, { wins: number; losses: number }>) {
    const record = records.get(team)
    return `${record?.wins ?? 0}-${record?.losses ?? 0}`
}

export function LeagueFeed({
  matchupResults = [],
  week = 1,
  teamName = "Montreal Monarchs",
  teamLogo = "",
  standings = defaultStandings,
  liveMatchups = {},
  activities = defaultActivities,
  roster = defaultRoster,
  players = [],
  isCommissioner = false,
  onWeekChange,
  onSelectMatchup,
  onSelectPlayer,
  onTrade,
  onSettings,
}: FeedProps) {
  const [showStandings, setShowStandings] = useState(false)
  const [showTransactions, setShowTransactions] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [playoffMode, setPlayoffMode] = useState(false)
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("ALL")
  const filteredActivities = activities.filter((item) => activityFilter === "ALL" || item.action === activityFilter)
  const weekSchedule = getWeekMatchups(week)
  const weeklyRecords = getWeeklyRecords(week, matchupResults)
  const displayMatchups = weekSchedule.map((matchup) => {
    const final = matchupResults.find((result) => result.week === week && result.isFinal && result.homeTeam === matchup.homeTeam && result.awayTeam === matchup.awayTeam)
    if (final) {
      return { ...matchup, homeRecord: recordFor(matchup.homeTeam, weeklyRecords), awayRecord: recordFor(matchup.awayTeam, weeklyRecords), homeScore: final.homeScore, awayScore: final.awayScore, projectedHome: final.homeScore, projectedAway: final.awayScore, status: "Final" }
    }
    const live = liveMatchups[matchup.id]
    const isUserHome = matchup.homeTeam === teamName
    const isUserAway = matchup.awayTeam === teamName
    const displayMatchup = {
      ...matchup,
      homeTeam: isUserHome ? teamName : matchup.homeTeam,
      awayTeam: isUserAway ? teamName : matchup.awayTeam,
    }
    if (live) {
      return {
        ...live,
        homeTeam: isUserHome ? teamName : live.homeTeam,
        awayTeam: isUserAway ? teamName : live.awayTeam,
        homeRecord: recordFor(matchup.homeTeam, weeklyRecords),
        awayRecord: recordFor(matchup.awayTeam, weeklyRecords),
      }
    }
    const home = calculateRosterSummary(matchup.homeTeam, roster, players, week)
    const away = calculateRosterSummary(matchup.awayTeam, roster, players, week)
    return {
      ...displayMatchup,
      homeRecord: recordFor(matchup.homeTeam, weeklyRecords),
      awayRecord: recordFor(matchup.awayTeam, weeklyRecords),
      homeScore: home.score,
      awayScore: away.score,
      projectedHome: home.projected,
      projectedAway: away.projected,
    }
  })
  const liveStandings = standings

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#070a12] text-white">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 space-y-5">
        <DraftCard players={players} isCommissioner={isCommissioner} />
        <WeeklyPodium week={week} matchups={displayMatchups} />
        <MatchupsSection week={week} matchups={displayMatchups} teamName={teamName} teamLogo={teamLogo} onSelect={(matchup) => onSelectMatchup?.(matchup.id)} onWeekChange={onWeekChange} />
        <StandingsSection
          standings={liveStandings}
          results={matchupResults ?? []}
          teamName={teamName}
          playoffMode={playoffMode}
          onToggle={() => setPlayoffMode((value) => !value)}
          onDetails={() => setShowStandings(true)}
          onTrade={onTrade}
        />
        <ActivitySection
          activities={filteredActivities.slice(0, 5)}
          roster={roster}
          filter={activityFilter}
          onFilter={() => setShowFilters(true)}
          onViewAll={() => setShowTransactions(true)}
          onSelectPlayer={onSelectPlayer}
        />
      </div>

      <StandingsSheet open={showStandings} standings={liveStandings} onClose={() => setShowStandings(false)} />
      <TransactionsSheet
        open={showTransactions}
        activities={filteredActivities}
        filter={activityFilter}
        onFilter={() => setShowFilters(true)}
        onClose={() => setShowTransactions(false)}
        roster={roster}
        onSelectPlayer={onSelectPlayer}
      />
      <FilterSheet
        open={showFilters}
        filter={activityFilter}
        onChange={setActivityFilter}
        managers={standings}
        onClose={() => setShowFilters(false)}
      />
    </section>
  )
}

/** Home win % from projected totals (which already include points banked so far); 50% when no projection exists. */
function winProbability(matchup: DisplayMatchup) {
  const home = matchup.projectedHome ?? matchup.homeScore
  const away = matchup.projectedAway ?? matchup.awayScore
  if (matchup.status === "Final") return matchup.homeScore === matchup.awayScore ? 50 : matchup.homeScore > matchup.awayScore ? 100 : 0
  if (home + away <= 0) return 50
  const spread = Math.max(10, 0.12 * (home + away))
  return Math.min(95, Math.max(5, Math.round(100 / (1 + Math.exp(-(home - away) / spread)))))
}

function WeeklyPodium({ week, matchups }: { week: number; matchups: DisplayMatchup[] }) {
  const teams = matchups.flatMap((matchup) => [
    { team: matchup.homeTeam, owner: matchup.homeOwner, points: matchup.homeScore > 0 ? matchup.homeScore : matchup.projectedHome ?? 0, projected: !(matchup.homeScore > 0) },
    { team: matchup.awayTeam, owner: matchup.awayOwner, points: matchup.awayScore > 0 ? matchup.awayScore : matchup.projectedAway ?? 0, projected: !(matchup.awayScore > 0) },
  ]).sort((a, b) => b.points - a.points).slice(0, 3).map((team, index) => ({
    ...team,
    place: index + 1,
    color: index === 0 ? "text-amber-300" : index === 1 ? "text-slate-300" : "text-orange-300",
    order: `order-${index + 1}${index === 0 ? " -mt-5" : ""}`,
  }))
  return <section className="rounded-2xl border border-[#16233b] bg-[#0d1424] px-3 pb-3 pt-2">
    <div className="mx-auto w-fit rounded-full border border-[#294463] bg-[#102642] px-3 py-1 text-xs font-black uppercase tracking-widest text-[#19ffff]">🏆 Week {week} Report</div>
    <div className="mt-5 flex items-end justify-center gap-2">
      {teams.map((team) => <div key={team.place} className={cn("flex w-1/3 flex-col items-center text-center", team.order)}>
        <div className={cn("mb-1 flex size-8 items-center justify-center rounded-full border-2 border-current bg-[#172338] text-xs font-black", team.color)}>#{team.place}</div>
        <div className="flex size-12 items-center justify-center rounded-full border border-[#294463] bg-[#1b2842] text-lg">🏒</div>
        <p className="mt-2 w-full truncate text-xs font-black">{team.team}</p>
        <p className="truncate text-xs text-[#6d86ab]">{team.owner}</p>
        <p className={cn("mt-1 text-sm font-black tabular-nums", team.color)}>{team.points.toFixed(2)}</p>
        {team.projected && <p className="text-xs font-black uppercase tracking-wider text-[#5e7090]">projected</p>}
      </div>)}
    </div>
  </section>
}

function MatchupsSection({ week, matchups, teamName, teamLogo, onSelect, onWeekChange }: { week: number; matchups: DisplayMatchup[]; teamName: string; teamLogo: string; onSelect: (matchup: MatchupSummary) => void; onWeekChange?: (week: number) => void }) {
  return <section>
    <div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-black">Matchups</h2><SwipeSurface zone="week" onSwipeLeft={() => onWeekChange?.(week + 1)} onSwipeRight={() => onWeekChange?.(Math.max(1, week - 1))} className="flex items-center gap-2 text-xs font-bold text-[#19ffff]"><button type="button" onClick={() => onWeekChange?.(Math.max(1, week - 1))} aria-label="Previous league week" className="rounded p-1 hover:bg-[#172338]"><ChevronLeft className="size-4" /></button><span>Week {week}</span><button type="button" onClick={() => onWeekChange?.(week + 1)} aria-label="Next league week" className="rounded p-1 hover:bg-[#172338]"><ChevronRight className="size-4" /></button></SwipeSurface></div>
    <div className="space-y-2">{matchups.map((matchup) => {
      const homeWin = winProbability(matchup)
      const homeResult = matchup.status === "Scheduled" ? undefined : matchup.homeScore === matchup.awayScore ? "TIE" : matchup.homeScore > matchup.awayScore ? matchup.status === "Final" ? "WIN" : "LEAD" : matchup.status === "Final" ? "LOSS" : "TRAIL"
      const awayResult = matchup.status === "Scheduled" ? undefined : matchup.awayScore === matchup.homeScore ? "TIE" : matchup.awayScore > matchup.homeScore ? matchup.status === "Final" ? "WIN" : "LEAD" : matchup.status === "Final" ? "LOSS" : "TRAIL"
      return <button key={matchup.id} type="button" onClick={() => onSelect(matchup)} className="w-full rounded-2xl border border-[#16233b] bg-[#0d1424] p-3 text-left transition-colors hover:bg-[#111c2e]">
        <div className="grid grid-cols-[1fr_36px_1fr] items-center gap-2">
          <TeamMatchup team={matchup.homeTeam} logo={matchup.homeTeam === teamName ? teamLogo : undefined} owner={matchup.homeOwner} record={matchup.homeRecord} result={homeResult} score={matchup.homeScore} projected={matchup.projectedHome} win={homeWin} align="left" />
          <div className="flex size-8 items-center justify-center rounded-full border border-[#294463] bg-[#102642] text-xs font-black text-[#8ba0c7]">VS</div>
          <TeamMatchup team={matchup.awayTeam} logo={matchup.awayTeam === teamName ? teamLogo : undefined} owner={matchup.awayOwner} record={matchup.awayRecord} result={awayResult} score={matchup.awayScore} projected={matchup.projectedAway} win={100 - homeWin} align="right" />
        </div>
      </button>
    })}</div>
  </section>
}

function TeamMatchup({ team, logo, owner, record, result, score, projected, win, align }: { team: string; logo?: string; owner: string; record: string; result?: string; score: number; projected?: number; win: number; align: "left" | "right" }) {
  return <div className={cn("min-w-0", align === "right" && "text-right")}><div className={cn("flex items-center gap-2", align === "right" && "flex-row-reverse")}><div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#172338]">{logo ? <img src={logo} alt="" className="size-full object-cover" /> : "🏒"}</div><p className="truncate text-xs font-black">{team}</p></div><p className="mt-1 truncate text-xs text-[#6d86ab]">{owner} · {record}{result ? ` · ${result}` : ""}</p><span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-xs font-black", win >= 50 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300")}>{win}% WIN</span><p className="mt-1 text-lg font-black tabular-nums">{score.toFixed(2)}</p><p className="text-xs text-[#5e7090]">{projected === undefined && !result ? "projection unavailable" : `proj. ${(projected ?? score).toFixed(2)}`}</p></div>
}

function StandingsSection({ standings, results, teamName, playoffMode, onToggle, onDetails, onTrade }: { standings: StandingRow[]; results: MatchupResult[]; teamName: string; playoffMode: boolean; onToggle: () => void; onDetails: () => void; onTrade?: (team: StandingRow) => void }) {
  return <section><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><h2 className="text-lg font-black">Standings</h2><button type="button" onClick={onDetails} className="text-xs font-bold text-[#19ffff]">Details &gt;</button></div><button type="button" onClick={onToggle} className="rounded-full border border-[#294463] bg-[#102642] px-2.5 py-1.5 text-xs font-black text-[#19ffff]">☲ {playoffMode ? "STAND." : "PLAYOFF"}</button></div>{playoffMode ? <PlayoffBracket standings={standings} results={results} /> : <div className="overflow-hidden rounded-xl border border-[#16233b] bg-[#0d1424]"><div className="grid grid-cols-[32px_1fr_58px_50px_50px] gap-1 border-b border-[#16233b] px-2 py-2 text-xs font-black uppercase tracking-wider text-[#5e7090]"><span>Rank</span><span>Name</span><span>Waiver</span><span className="text-right">PF</span><span className="text-right">PA</span></div>{standings.map((row) => <div key={`${row.team}-${row.owner}`} className={cn("grid grid-cols-[32px_1fr_58px_50px_50px] items-center gap-1 border-b border-[#111929] px-2 py-2 last:border-0", row.team === teamName && "border-l-2 border-l-[#19ffff] bg-[#0c2231]")}><div><b className="text-xs">{row.rank}</b><span className={cn("block text-xs font-bold", row.delta?.startsWith("+") ? "text-emerald-300" : "text-rose-300")}>{row.delta ? `${row.delta.startsWith("+") ? "▲" : "▼"} ${row.delta.replace("-", "")}` : "—"}</span></div><button type="button" onClick={() => onTrade?.(row)} className="min-w-0 text-left"><p className="truncate text-xs font-black">{row.team}</p><p className="truncate text-xs text-[#6d86ab]">{row.owner} · {row.wins}-{row.losses}{row.streak && <> · <span className={row.streak.endsWith("W") ? "text-emerald-300" : "text-rose-300"}>{row.streak}</span></>}</p></button><span className="text-xs font-bold text-amber-300">${row.faabRemaining} <span className="text-[#6d86ab]">(6)</span></span><span className="text-right text-xs tabular-nums">{row.pointsFor.toFixed(1)}</span><span className="text-right text-xs tabular-nums">{row.pointsAgainst.toFixed(1)}</span></div>)}</div>}</section>
}

function PlayoffBracket({ standings, results }: { standings: StandingRow[]; results: MatchupResult[] }) {
  const bracket = buildPlayoffBracket({ standings, results, currentWeek: getCurrentFantasyWeek() })
  return (
    <div className="rounded-xl border border-[#16233b] bg-[#0d1424] p-3">
      <p className="text-xs text-[#8ba0c7]">{bracket.live ? "Seeds locked from the standings entering week 15. A tie goes to the higher seed." : "Projected from the current standings. Seeds lock when week 15 starts."}</p>
      <div className="mt-3 space-y-4">
        {bracket.rounds.map((round) => (
          <section key={round.title}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#5e7090]">{round.title}</h3>
            <div className="mt-2 space-y-2">
              {round.games.map((game) => <BracketGameCard key={game.id} game={game} />)}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-3 text-xs text-[#6d86ab]">Seeds 7–12 keep playing. That consolation bracket is separate from this one.</p>
    </div>
  )
}

function BracketGameCard({ game }: { game: BracketGame }) {
  if (game.status === "Bye") {
    return (
      <div className="rounded-lg border border-[#294463] bg-[#102642] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-sm font-bold text-white">{game.home.label}</p>
          <p className="shrink-0 text-xs font-bold text-[#8ba0c7]">Bye</p>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-[#294463] bg-[#102642] px-3 py-2">
      <BracketSideRow side={game.home} status={game.status} />
      <BracketSideRow side={game.away} status={game.status} />
      <p className="mt-1 text-xs text-[#5e7090]">{game.status === "Final" ? "Final" : game.status === "Live" ? "Live" : "Scheduled"}</p>
    </div>
  )
}

function BracketSideRow({ side, status }: { side: BracketGame["away"]; status: BracketGame["status"] }) {
  if (!side) return null
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <p className={cn("min-w-0 truncate text-sm font-bold", side.winner ? "text-white" : status === "Final" ? "text-[#5e7090]" : "text-white")}>{side.label}</p>
      <p className={cn("shrink-0 text-sm font-black tabular-nums", side.winner ? "text-[#19ffff]" : "text-[#8ba0c7]")}>{side.points == null ? "" : side.points.toFixed(2)}</p>
    </div>
  )
}

function ActivitySection({ activities, roster, filter, onFilter, onViewAll, onSelectPlayer }: { activities: ActivityItem[]; roster: Player[]; filter: ActivityFilter; onFilter: () => void; onViewAll: () => void; onSelectPlayer?: (player: Player) => void }) {
  return <section><div className="mb-2 flex items-center justify-between"><h2 className="text-lg font-black">Activity</h2><button type="button" onClick={onViewAll} className="text-xs font-bold text-[#19ffff]">View all</button></div><div className="space-y-2">{activities.map((item) => <ActivityCard key={item.id} item={item} roster={roster} onSelectPlayer={onSelectPlayer} />)}</div><button type="button" onClick={onFilter} className="mt-2 flex items-center gap-1 text-xs font-bold text-[#8ba0c7]"><Filter className="size-3" /> {filter === "ALL" ? "Filter activity" : filter}</button></section>
}

function ActivityCard({ item, roster, onSelectPlayer }: { item: ActivityItem; roster: Player[]; onSelectPlayer?: (player: Player) => void }) {
  const player = roster.find((candidate) => candidate.name === item.player)
  return <div className="rounded-xl border border-[#16233b] bg-[#0d1424] p-3"><div className="flex items-center justify-between"><p className="text-xs font-black">{item.owner}</p><span className={cn("rounded px-1.5 py-0.5 text-xs font-black", item.action === "DROP" ? "bg-rose-400/10 text-rose-300" : item.action === "TRADE" ? "bg-amber-400/10 text-amber-300" : "bg-emerald-400/10 text-emerald-300")}>{item.action === "ADD" ? "FREE AGENCY" : item.action}</span></div><button type="button" disabled={!player} onClick={() => player && onSelectPlayer?.(player)} className="mt-2 flex w-full items-center gap-2 text-left disabled:cursor-default"><span className={cn("flex h-7 min-w-7 items-center justify-center rounded px-1 text-xs font-black text-white", badgeColors[player?.position ?? "D"])}>{player?.position ?? item.detail.split(" ")[0]}</span><PlayerPortrait name={item.player} className="size-7 bg-[#172338]" /><span className="min-w-0 flex-1"><b className="block truncate text-xs">{item.action === "DROP" ? "- " : "+ "}{item.player}</b><small className="text-xs text-[#6d86ab]">{item.detail}</small></span>{item.action === "ADD" && <span className="text-xs font-black text-amber-300">BID $5</span>}</button><p className="mt-2 text-xs text-[#5e7090]">{item.time}</p></div>
}

function MatchupSheet({ week, matchup, roster, players = [], onClose, onSelectPlayer }: { week: number; matchup: MatchupSummary | null; roster: Player[]; players?: MarketPlayer[]; onClose: () => void; onSelectPlayer?: (player: Player) => void }) {
  const open = Boolean(matchup)
  if (!open) return null
  const home = matchup ? getTeamRoster(matchup.homeTeam, roster, players) : []
  const away = matchup ? getTeamRoster(matchup.awayTeam, roster, players) : []
  return <Sheet open={open} onOpenChange={(value) => !value && onClose()}><SheetContent side="bottom" className="mx-auto h-[92vh] max-h-[92vh] w-full max-w-[430px] gap-0 overflow-hidden rounded-t-3xl border-[#1a263d] bg-[#070a12] p-0 text-white"><div className="shrink-0 border-b border-[#1a263d] p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Week {week} Matchup</h2><button type="button" onClick={onClose} className="rounded-full bg-[#172338] p-2"><X className="size-4" /></button></div>{matchup && <div className="mt-3 grid grid-cols-3 items-center text-center"><div><p className="truncate text-xs font-black">{matchup.homeTeam}</p><b className="text-xl">{matchup.homeScore.toFixed(2)}</b><p className="text-xs text-emerald-300">{winProbability(matchup as DisplayMatchup)}% WIN</p></div><span className="text-xs font-black text-[#5e7090]">VS</span><div><p className="truncate text-xs font-black">{matchup.awayTeam}</p><b className="text-xl">{matchup.awayScore.toFixed(2)}</b><p className="text-xs text-emerald-300">{100 - winProbability(matchup as DisplayMatchup)}% WIN</p></div></div>}</div>{matchup && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"><p className="mb-2 text-xs font-black uppercase tracking-widest text-[#5e7090]">Starter comparison · 20 slots</p>{starterSlots.map((slot, index) => { const left = home.filter((player) => player.slot === slot)[index % Math.max(home.filter((player) => player.slot === slot).length, 1)]; const right = away.filter((player) => player.slot === slot)[index % Math.max(away.filter((player) => player.slot === slot).length, 1)]; return <div key={`${slot}-${index}`} className="grid grid-cols-[1fr_32px_1fr] items-center gap-2 border-b border-[#111929] py-2"><button type="button" disabled={!left} onClick={() => left && onSelectPlayer?.(left)} className="min-w-0 text-left disabled:opacity-50"><b className="block truncate text-xs">{left?.name ?? "Empty slot"}</b><span className="text-xs text-[#6d86ab]">{left ? `${slot} · ${(left.todayPts ?? left.projPts).toFixed(1)} FPTS` : slot}</span></button><span className={cn("mx-auto flex size-5 items-center justify-center rounded text-xs font-black text-white", badgeColors[slot])}>{slot}</span><button type="button" disabled={!right} onClick={() => right && onSelectPlayer?.(right)} className="min-w-0 text-right disabled:opacity-50"><b className="block truncate text-xs">{right?.name ?? "Empty slot"}</b><span className="text-xs text-[#6d86ab]">{right ? `${slot} · ${(right.todayPts ?? right.projPts).toFixed(1)} FPTS` : slot}</span></button></div> })}</div>}</SheetContent></Sheet>
}

function StandingsSheet({ open, standings, onClose }: { open: boolean; standings: StandingRow[]; onClose: () => void }) {
  if (!open) return null
  return <Sheet open={open} onOpenChange={(value) => !value && onClose()}><SheetContent side="bottom" className="mx-auto h-[88vh] max-h-[88vh] w-full max-w-[430px] gap-0 overflow-hidden rounded-t-3xl border-[#1a263d] bg-[#070a12] p-0 text-white"><div className="shrink-0 border-b border-[#1a263d] p-4"><div className="flex items-center justify-between"><h2 className="text-lg font-black">Standings</h2><button type="button" onClick={onClose}><X className="size-5" /></button></div><p className="mt-1 text-xs text-[#6d86ab]">Extended league details</p></div><div className="min-h-0 flex-1 overflow-y-auto p-3">{standings.map((row) => <div key={`${row.team}-${row.owner}`} className="grid grid-cols-[28px_1fr_60px_60px] gap-2 border-b border-[#111929] py-3"><b>{row.rank}</b><div><p className="text-xs font-black">{row.team}</p><p className="text-xs text-[#6d86ab]">{row.owner} · {row.wins}-{row.losses}</p></div><span className="text-right text-xs tabular-nums">PF<br />{row.pointsFor.toFixed(1)}<br /><span className="text-[#6d86ab]">MAX {Math.ceil(row.pointsFor * 1.08)}</span></span><span className="text-right text-xs tabular-nums">PA<br />{row.pointsAgainst.toFixed(1)}<br /><span className="text-amber-300">${row.faabRemaining}</span></span></div>)}</div></SheetContent></Sheet>
}

function TransactionsSheet({ open, activities, filter, onFilter, onClose, roster, onSelectPlayer }: { open: boolean; activities: ActivityItem[]; filter: ActivityFilter; onFilter: () => void; onClose: () => void; roster: Player[]; onSelectPlayer?: (player: Player) => void }) {
  if (!open) return null
  return <Sheet open={open} onOpenChange={(value) => !value && onClose()}><SheetContent side="bottom" className="mx-auto h-[88vh] max-h-[88vh] w-full max-w-[430px] gap-0 overflow-hidden rounded-t-3xl border-[#1a263d] bg-[#070a12] p-0 text-white"><div className="flex shrink-0 items-center justify-between border-b border-[#1a263d] p-4"><h2 className="text-lg font-black">League transactions</h2><div className="flex items-center gap-3"><button type="button" onClick={onFilter} className="flex items-center gap-1 text-xs font-black text-[#19ffff]"><SlidersHorizontal className="size-3" /> FILTER</button><button type="button" onClick={onClose}><X className="size-5" /></button></div></div><div className="min-h-0 flex-1 overflow-y-auto space-y-2 p-3">{activities.map((item) => <ActivityCard key={item.id} item={item} roster={roster} onSelectPlayer={onSelectPlayer} />)}{activities.length === 0 && <p className="p-5 text-center text-sm text-[#6d86ab]">No transactions match this filter.</p>}</div><div className="shrink-0 border-t border-[#1a263d] p-3 text-xs text-[#6d86ab]">{filter === "ALL" ? "All transaction types" : filter}</div></SheetContent></Sheet>
}

function FilterSheet({ open, filter, onChange, managers, onClose }: { open: boolean; filter: ActivityFilter; onChange: (filter: ActivityFilter) => void; managers: StandingRow[]; onClose: () => void }) {
  if (!open) return null
  return <Sheet open={open} onOpenChange={(value) => !value && onClose()}><SheetContent side="bottom" className="mx-auto max-h-[88vh] w-full max-w-[430px] gap-0 rounded-t-3xl border-[#1a263d] bg-[#070a12] p-0 text-white"><div className="flex items-center justify-between border-b border-[#1a263d] p-4"><h2 className="text-lg font-black">Filter transactions</h2><button type="button" onClick={onClose}><X className="size-5" /></button></div><div className="space-y-4 p-4"><div><p className="mb-2 text-xs font-black uppercase tracking-widest text-[#5e7090]">Transaction type</p><div className="grid grid-cols-2 gap-2">{(["ALL", "TRADE", "ADD", "DROP"] as ActivityFilter[]).map((option) => <button key={option} type="button" onClick={() => { onChange(option); onClose() }} className={cn("rounded-lg border px-3 py-2 text-xs font-bold", filter === option ? "border-[#19ffff] bg-[#0c2231] text-[#19ffff]" : "border-[#16233b] bg-[#0d1424] text-[#8ba0c7]")}>{option === "ALL" ? "All Types" : option === "ADD" ? "Free Agents" : option === "DROP" ? "Waivers" : "Trades"}</button>)}</div></div><div><p className="mb-2 text-xs font-black uppercase tracking-widest text-[#5e7090]">Managers</p><div className="grid grid-cols-2 gap-2">{managers.map((manager) => <label key={`${manager.team}-${manager.owner}`} className="flex items-center gap-2 rounded-lg border border-[#16233b] bg-[#0d1424] p-2 text-xs"><input type="checkbox" defaultChecked className="accent-cyan-400" />{manager.owner}</label>)}</div></div></div></SheetContent></Sheet>
}
