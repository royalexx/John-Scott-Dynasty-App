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

export interface DashboardInitialData {
  leagueId?: string
  teamId?: string
  managerHandle?: string
  teamName: string
  teamLogo?: string
  userFaab: number
  roster: Player[]
  standings: StandingRow[]
  draftPicks: string[]
  draftPickAssets?: Array<{ id: string; label: string; detail?: string }>
  activities: ActivityItem[]
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
