import {
  activities,
  defaultFaabBudget,
  draftPicks,
  roster,
  standings,
  type ActivityItem,
  type Player,
  type StandingRow,
} from "@/lib/hockey-data"

export interface MatchupResult {
  week: number
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  isFinal: boolean
}

export interface LineupLockInfo {
  mode: "WEEKLY" | "DAILY"
  locked: boolean
  week: number
  firstGameAt: string | null
  weekEndDate: string
}

export interface DashboardInitialData {
  matchupResults?: MatchupResult[]
  lineupLock?: LineupLockInfo
  leagueId?: string
  teamId?: string
  managerHandle?: string
  isCommissioner?: boolean
  teamName: string
  teamLogo?: string
  userFaab: number
  waiverPriority?: number
  leagueRosters?: Record<string, Array<{ nhlId: number; slot: string }>>
  roster: Player[]
  standings: StandingRow[]
  draftPicks: string[]
  draftPickAssets?: Array<{ id: string; label: string; detail?: string }>
  activities: ActivityItem[]
  league?: {
    rosterPositions?: Record<string, number>
    scoringSettings?: Record<string, unknown>
    waiverSettings?: Record<string, unknown>
    tradeSettings?: Record<string, unknown>
    draftSettings?: Record<string, unknown>
    rosterSize?: number
    taxiSlots: number
    taxiMaxGames: number
    irSlots: number
    lineupLockMode?: "WEEKLY" | "DAILY"
    currentWeek: number
  }
}

export const initialDashboardData: DashboardInitialData = {
  leagueId: "00000000-0000-0000-0000-000000000001",
  teamName: "Montreal Monarchs",
  userFaab: defaultFaabBudget,
  roster,
  standings,
  draftPicks,
  activities,
}
