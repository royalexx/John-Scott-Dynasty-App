"use client"

import { useState } from "react"
import { ArrowLeftRight, ChevronDown, Settings, Swords, Trophy, Users, Zap } from "lucide-react"
import {
  activities as defaultActivities,
  getTeamRoster,
  league as defaultLeague,
  roster as defaultRoster,
  standings as defaultStandings,
  weekMatchups,
  type ActivityItem,
  type MatchupSummary,
  type Player,
  type StandingRow,
} from "@/lib/hockey-data"
import { cn } from "@/lib/utils"

export type LeaguePanelTab = "standings" | "bracket" | "teams" | "activity"
export type LeagueActivityFilter = "ALL" | ActivityItem["action"]

export interface LeaguePanelProps {
  leagueName?: string
  teamName?: string
  week?: number
  standings?: StandingRow[]
  matchups?: MatchupSummary[]
  activities?: ActivityItem[]
  roster?: Player[]
  activeTab?: LeaguePanelTab
  onTabChange?: (tab: LeaguePanelTab) => void
  onTeamRoster?: (team: StandingRow) => void
  onTrade?: (team: StandingRow) => void
  onSelectPlayer?: (player: Player) => void
  onPlayerSelect?: (player: Player) => void
  onSettings?: () => void
}

const tabs: Array<{ id: LeaguePanelTab; label: string }> = [
  { id: "standings", label: "STANDINGS" },
  { id: "bracket", label: "BRACKET" },
  { id: "teams", label: "TEAMS" },
  { id: "activity", label: "ACTIVITY" },
]
const activityStyles = {
  ADD: "text-emerald-300 bg-emerald-400/10",
  DROP: "text-rose-300 bg-rose-400/10",
  TRADE: "text-amber-200 bg-amber-400/10",
}

export function LeaguePanel({
  leagueName = defaultLeague.name,
  teamName,
  week = defaultLeague.week,
  standings = defaultStandings,
  matchups = weekMatchups,
  activities = defaultActivities,
  roster = defaultRoster,
  activeTab,
  onTabChange,
  onTeamRoster,
  onTrade,
  onSelectPlayer,
  onPlayerSelect,
  onSettings,
}: LeaguePanelProps) {
  const [localTab, setLocalTab] = useState<LeaguePanelTab>("standings")
  const [bracketMode, setBracketMode] = useState<"REGULAR" | "PLAYOFF">("REGULAR")
  const [activityFilter, setActivityFilter] = useState<LeagueActivityFilter>("ALL")
  const tab = activeTab ?? localTab
  const selectPlayer = onSelectPlayer ?? onPlayerSelect
  const changeTab = (next: LeaguePanelTab) => {
    if (activeTab === undefined) setLocalTab(next)
    onTabChange?.(next)
  }
  const leader = standings[0]
  const filteredActivities = activities.filter((item) => activityFilter === "ALL" || item.action === activityFilter)

  return (
    <section className="overflow-hidden rounded-2xl border border-[#172338] bg-[#080c14] text-white shadow-2xl shadow-black/20">
      <header className="relative overflow-hidden border-b border-[#203452] bg-gradient-to-br from-[#142b4a] via-[#0d1e36] to-[#091321] px-4 pb-5 pt-4 sm:px-6">
        <div className="pointer-events-none absolute -right-8 -top-12 size-44 rounded-full border-[18px] border-[#19ffff]/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#19ffff]"><span className="flex size-7 items-center justify-center rounded-lg bg-[#19ffff]/10"><Trophy className="size-4" /></span>League hub</div>
            <h1 className="mt-3 text-xl font-black tracking-tight sm:text-2xl">{leagueName}</h1>
            <p className="mt-1 text-xs text-[#8ba0c7]">Week {week} <span className="px-1 text-[#3d5577]">•</span> Head-to-head points</p>
          </div>
          <button type="button" onClick={onSettings} aria-label="League settings" className="rounded-full border border-[#294463] bg-[#102642] p-2.5 text-[#8ba0c7] hover:border-[#19ffff] hover:text-[#19ffff]"><Settings className="size-4" /></button>
        </div>
        <div className="relative mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["12 Teams", "League size"], ["20 Starters", "Roster format"], ["$100 FAAB", "Waiver budget"], ["2025-26", "Year 1 Dynasty"]].map(([value, label]) => (
            <div key={value} className="rounded-lg border border-[#294463]/70 bg-[#081729]/60 px-3 py-2"><p className="text-sm font-black tabular-nums text-white">{value}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-[#6d86ab]">{label}</p></div>
          ))}
        </div>
      </header>

      <nav className="grid grid-cols-4 border-b border-[#172338] bg-[#0d1424] px-2" aria-label="League views">
        {tabs.map(({ id, label }) => <button key={id} type="button" onClick={() => changeTab(id)} className={cn("relative px-1 py-3 text-[10px] font-black tracking-wide transition sm:text-xs", tab === id ? "text-[#19ffff]" : "text-[#6d86ab] hover:text-white")}>{label}{tab === id && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[#19ffff]" />}</button>)}
      </nav>

      {tab === "standings" && <div className="p-4 sm:p-5"><StandingsList standings={standings} teamName={teamName} onTeamRoster={onTeamRoster} onTrade={onTrade} /></div>}
      {tab === "bracket" && <Bracket matchups={matchups} mode={bracketMode} onModeChange={setBracketMode} week={week} />}
      {tab === "teams" && <Teams standings={standings} roster={roster} onTeamRoster={onTeamRoster} onTrade={onTrade} onSelectPlayer={selectPlayer} />}
      {tab === "activity" && <Activity activities={filteredActivities} filter={activityFilter} onFilterChange={setActivityFilter} roster={roster} onSelectPlayer={selectPlayer} />}
    </section>
  )
}

function StandingsList({ standings, teamName, onTeamRoster, onTrade }: { standings: StandingRow[]; teamName?: string; onTeamRoster?: (team: StandingRow) => void; onTrade?: (team: StandingRow) => void }) {
  return <section><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-black">League standings</h2><span className="text-[10px] text-[#5e7090]">W-L · PF · PA · FAAB</span></div><div className="overflow-hidden rounded-xl border border-[#172338]">{standings.map((team) => <div key={team.team}>{team.rank === 7 && <div className="flex items-center gap-2 border-y border-emerald-400/40 bg-emerald-400/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />Playoff cutoff · Top 6</div>}<div className={cn("flex items-center gap-2 border-b border-[#172338] bg-[#0d1424] px-2 py-3 last:border-0", team.team === teamName && "border-l-2 border-l-[#19ffff] bg-[#0c2231]")}><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#172338] text-xs font-black">{team.rank}</span><button type="button" onClick={() => onTeamRoster?.(team)} className="min-w-0 flex-1 text-left hover:text-[#19ffff]"><p className="truncate text-xs font-black">{team.team}</p><p className="truncate text-[10px] text-[#6d86ab]">{team.owner}</p></button><span className="text-right text-[10px] font-bold tabular-nums"><b>{team.wins}-{team.losses}</b><span className="block text-[#6d86ab]">{team.pointsFor.toFixed(1)} PF · {team.pointsAgainst.toFixed(1)} PA</span><span className="block text-amber-300">${team.faabRemaining}</span></span><button type="button" onClick={() => onTrade?.(team)} aria-label={`Trade with ${team.team}`} className="rounded-md p-1.5 text-[#6d86ab] hover:bg-[#172338] hover:text-[#19ffff]"><ArrowLeftRight className="size-3.5" /></button></div></div>)}</div></section>
}

function Bracket({ matchups, mode, onModeChange, week }: { matchups: MatchupSummary[]; mode: "REGULAR" | "PLAYOFF"; onModeChange: (mode: "REGULAR" | "PLAYOFF") => void; week: number }) {
  return <div className="space-y-4 p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="text-sm font-black">{mode === "REGULAR" ? "Weekly matchups" : "Playoff bracket"}</h2><p className="text-[10px] text-[#6d86ab]">{mode === "REGULAR" ? `Week ${week} results and live scores` : "Championship path"}</p></div><div className="relative"><select value={mode} onChange={(event) => onModeChange(event.target.value as "REGULAR" | "PLAYOFF")} className="appearance-none rounded-full border border-[#294463] bg-[#102642] py-2 pl-3 pr-8 text-[10px] font-black text-[#19ffff] outline-none"><option value="REGULAR">REGULAR SEASON</option><option value="PLAYOFF">PLAYOFFS</option></select><ChevronDown className="pointer-events-none absolute right-2 top-2.5 size-3 text-[#19ffff]" /></div></div><div className="grid gap-3 sm:grid-cols-2">{matchups.map((matchup) => <MatchupCard key={matchup.id} matchup={matchup} />)}</div>{mode === "PLAYOFF" && <div className="rounded-xl border border-dashed border-[#294463] bg-[#0d1424] p-4 text-center text-xs text-[#8ba0c7]">Playoff seeding locks after Week 14. Current top seed: {matchups[0]?.homeTeam ?? "TBD"}.</div>}</div>
}

function MatchupCard({ matchup }: { matchup: MatchupSummary }) {
  const homeWon = matchup.homeScore >= matchup.awayScore
  return <div className="rounded-xl border border-[#172338] bg-[#0d1424] p-3"><div className="mb-3 flex items-center justify-between text-[9px] font-bold uppercase text-[#5e7090]"><span>{matchup.status}</span><Swords className="size-3.5" /></div><div className="flex items-center justify-between gap-2 text-xs font-bold"><span className={cn("truncate", homeWon && "text-[#19ffff]")}>{matchup.homeTeam}</span><span className="tabular-nums">{matchup.homeScore.toFixed(1)}</span></div><div className="mt-1 flex items-center justify-between gap-2 text-xs font-bold"><span className={cn("truncate", !homeWon && "text-[#ff2a85]")}>{matchup.awayTeam}</span><span className="tabular-nums">{matchup.awayScore.toFixed(1)}</span></div><div className="mt-3 h-1 overflow-hidden rounded-full bg-[#ff2a85]"><div className="h-full bg-[#19ffff]" style={{ width: `${Math.round((matchup.homeScore / Math.max(matchup.homeScore + matchup.awayScore, 1)) * 100)}%` }} /></div></div>
}

function Teams({ standings, roster, onTeamRoster, onTrade, onSelectPlayer }: { standings: StandingRow[]; roster: Player[]; onTeamRoster?: (team: StandingRow) => void; onTrade?: (team: StandingRow) => void; onSelectPlayer?: (player: Player) => void }) {
  return <div className="space-y-3 p-4 sm:p-5"><div className="flex items-center gap-2"><Users className="size-4 text-[#19ffff]" /><h2 className="text-sm font-black">All teams</h2><span className="text-[10px] text-[#5e7090]">({standings.length})</span></div><div className="grid gap-3 sm:grid-cols-2">{standings.map((team) => <article key={team.team} className="rounded-xl border border-[#172338] bg-[#0d1424] p-3"><div className="flex items-start gap-2"><button type="button" onClick={() => onTeamRoster?.(team)} className="min-w-0 flex-1 text-left hover:text-[#19ffff]"><p className="truncate text-xs font-black">{team.team}</p><p className="text-[10px] text-[#6d86ab]">{team.owner} · {team.wins}-{team.losses}</p></button><button type="button" onClick={() => onTrade?.(team)} aria-label={`Trade with ${team.team}`} className="rounded-md p-1.5 text-[#6d86ab] hover:text-[#19ffff]"><ArrowLeftRight className="size-3.5" /></button></div><div className="mt-3 flex gap-1.5">{getTeamRoster(team.team, roster).slice(0, 5).map((player) => <button key={player.id} type="button" onClick={() => onSelectPlayer?.(player)} title={player.name} className="flex size-8 items-center justify-center rounded-full border border-[#294463] bg-[#172338] text-[9px] font-black text-[#aeb4ff] hover:border-[#19ffff]">{player.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</button>)}</div><p className="mt-2 text-[10px] text-[#6d86ab]">{getTeamRoster(team.team, roster).length} players · {team.pointsFor.toFixed(1)} PF</p></article>)}</div></div>
}

function Activity({ activities, filter, onFilterChange, roster, onSelectPlayer }: { activities: ActivityItem[]; filter: LeagueActivityFilter; onFilterChange: (filter: LeagueActivityFilter) => void; roster: Player[]; onSelectPlayer?: (player: Player) => void }) {
  return <div className="space-y-4 p-4 sm:p-5"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-black"><Zap className="size-4 text-amber-300" />League activity</h2><p className="mt-1 text-[10px] text-[#6d86ab]">Recent adds, drops, and trades</p></div><div className="flex gap-1">{(["ALL", "TRADE", "ADD", "DROP"] as const).map((value) => <button key={value} type="button" onClick={() => onFilterChange(value)} className={cn("rounded-full px-2 py-1 text-[9px] font-black", filter === value ? "bg-[#19ffff] text-[#080c14]" : "bg-[#172338] text-[#8ba0c7]")}>{value === "ADD" ? "WAIVERS" : value === "DROP" ? "COMMISH" : value}</button>)}</div></div><div className="divide-y divide-[#172338] rounded-xl border border-[#172338] bg-[#0d1424]">{activities.length ? activities.map((item) => { const player = roster.find((candidate) => candidate.name === item.player); return <div key={item.id} className="flex items-center gap-3 px-3 py-3"><span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black", activityStyles[item.action])}>{item.action === "TRADE" ? <ArrowLeftRight className="size-3.5" /> : item.action === "ADD" ? "+" : "−"}</span><p className="min-w-0 flex-1 truncate text-xs"><b>{item.owner}</b> {item.action.toLowerCase()} {player ? <button type="button" onClick={() => onSelectPlayer?.(player)} className="font-bold text-[#aeb4ff] hover:text-[#19ffff]">{item.player}</button> : <span className="text-[#aeb4ff]">{item.player}</span>}<span className="ml-1 text-[#5e7090]">· {item.detail}</span></p><span className="shrink-0 text-[9px] text-[#5e7090]">{item.time}</span></div>}) : <p className="p-8 text-center text-xs text-[#6d86ab]">No activity matches this filter.</p>}</div></div>
}
