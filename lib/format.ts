const EASTERN = "America/New_York"

export const easternTime12h = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: EASTERN,
})

export const easternTime24h = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: EASTERN,
})

export const easternShortDateTime = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: EASTERN,
})

export const easternDateOnly = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: EASTERN,
})
