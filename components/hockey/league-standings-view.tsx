import { cn } from "@/lib/utils"
import { standings, weekMatchups, type ActivityItem } from "@/lib/hockey-data"
export function LeagueStandingsView({ week, teamName, activities = [] }: { week: number; teamName: string; activities?: ActivityItem[] }) {
  return (
    <div className="flex flex-col pb-6">
      <div className="border-b border-[#111929] px-3.5 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black text-white">Matchups</h2>
          <span className="text-[10px] font-bold uppercase text-[#5e7090]">Week {week}</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {weekMatchups.map((matchup) => {
            const homeProjection = matchup.homeScore + 12
            const awayProjection = matchup.awayScore + 8
            const homeWin = Math.round((homeProjection / Math.max(homeProjection + awayProjection, 1)) * 100)
            return (
              <div key={matchup.id} className="min-w-[174px] rounded-lg border border-[#172338] bg-[#0d1424] p-2.5">
                <div className="flex items-center justify-between gap-2 text-[9px] font-bold text-white">
                  <span className="truncate">{matchup.homeTeam}</span>
                  <span className="text-[#5e7090]">VS</span>
                  <span className="truncate text-right">{matchup.awayTeam}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm font-black tabular-nums text-white">
                  <span>{matchup.homeScore.toFixed(1)}</span>
                  <span>{matchup.awayScore.toFixed(1)}</span>
                </div>
                <div className="mt-2 flex h-1 overflow-hidden rounded-full bg-[#ff2a85]">
                  <div className="bg-[#19ffff]" style={{ width: `${homeWin}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[8px] font-black tabular-nums">
                  <span className="text-[#19ffff]">{homeWin}%</span>
                  <span className="text-[#ff2a85]">{100 - homeWin}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="flex items-center justify-between px-3.5 py-3 border-b border-[#111929]">
        <h2 className="text-sm font-black text-white">Standings Details <span className="text-[#19ffff]">&gt;</span></h2>
        <button type="button" className="rounded-full border border-[#263858] bg-[#172338] px-2.5 py-1 text-[10px] font-black text-[#aeb4ff]">🏆 PLAYOFF</button>
      </div>

      <div className="grid grid-cols-[36px_1fr_58px_58px_58px] border-b border-[#111929] px-3.5 py-2 text-[9px] font-black uppercase text-[#5e7090]">
        <span>Rank</span><span>Name</span><span className="text-right">Waiver</span><span className="text-right">PF</span><span className="text-right">PA</span>
      </div>

      {standings.map((row) => (
        <div key={row.team} className={cn("grid grid-cols-[36px_1fr_58px_58px_58px] items-center border-b border-[#111929] px-3.5 py-2.5", row.team === teamName && "border-l-2 border-l-[#19ffff] bg-[#0c2231]")}>
          <div className="flex flex-col">
            <span className="text-xs font-black text-white">{row.rank}</span>
            {row.delta && <span className={cn("text-[9px] font-bold", row.delta.startsWith("+") ? "text-emerald-400" : "text-[#ff2a85]")}>{row.delta}</span>}
          </div>
          <div className="min-w-0 pr-1">
            <p className={cn("flex items-center gap-1 truncate text-xs font-bold", row.team === teamName ? "text-[#19ffff]" : "text-white")}>
              {row.team}
            </p>
            <p className="text-[10px] text-[#5e7090] truncate">{row.owner} · {row.wins}-{row.losses}</p>
          </div>
          <span className="text-right text-xs font-bold text-[#8ba0c7]">${row.faabRemaining}</span>
          <span className="text-right text-xs font-bold text-white tabular-nums">{row.pointsFor.toFixed(1)}</span>
          <span className="text-right text-xs font-bold text-[#5e7090] tabular-nums">{row.pointsAgainst.toFixed(1)}</span>
        </div>
      ))}

      <div className="px-3.5 pt-5 pb-2"><h3 className="text-sm font-black text-white">Activity Feed</h3></div>
      <div className="flex flex-col gap-2 px-3.5">
        {activities.map((act) => (
          <div key={act.id} className="rounded-lg border border-[#172338] bg-[#0d1424] px-3 py-2.5">
            <p className="text-[10px] font-bold text-white">{act.owner}<span className="ml-2 font-normal text-[#5e7090]">{act.action === "TRADE" ? "TRADE" : "FREE AGENCY"} · {act.time}</span></p>
            <p className="mt-1 text-xs text-white">
              <span className={cn("mr-2 font-black", act.action === "ADD" ? "text-[#19ffff]" : act.action === "TRADE" ? "text-[#aeb4ff]" : "text-[#ff2a85]")}>{act.action === "ADD" ? "+ ADD" : act.action === "TRADE" ? "↔ TRADE" : "- DROP"}</span>
              {act.player} <span className="text-[#5e7090]">({act.detail})</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
