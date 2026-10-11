const FANTASY_WEEK_START_MONTH = 9
const FANTASY_WEEK_START_DAY = 5

function getSeasonStart(season: number): Date {
  return new Date(Date.UTC(season, FANTASY_WEEK_START_MONTH, FANTASY_WEEK_START_DAY))
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getFantasyWeekDates(week: number, season = 2026): {
  startDate: string
  endDate: string
  dates: string[]
} {
  const normalizedWeek = Number.isFinite(week) ? Math.max(1, Math.floor(week)) : 1
  const startDate = getSeasonStart(season)
  startDate.setUTCDate(startDate.getUTCDate() + (normalizedWeek - 1) * 7)
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(startDate)
    date.setUTCDate(startDate.getUTCDate() + index)
    return toDateString(date)
  })

  return {
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    dates,
  }
}

export function getCurrentFantasyWeek(season = 2026): number {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
  const currentDate = new Date(`${today}T00:00:00Z`)
  const seasonStart = getSeasonStart(season)
  const elapsedDays = Math.floor((currentDate.getTime() - seasonStart.getTime()) / 86_400_000)
  return Math.max(1, Math.floor(elapsedDays / 7) + 1)
}
