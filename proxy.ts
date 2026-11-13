import { NextRequest, NextResponse } from "next/server"
import { activities, marketPlayers } from "@/lib/hockey-data"
import { getCurrentFantasyWeek } from "@/lib/season-calendar"

/**
 * Hosted PR previews are read-only by default.
 *
 * Until a distinct preview database is configured, API GET requests receive
 * explicitly non-persistent fixture content rather than attempting Prisma
 * queries against an undefined DATABASE_URL.
 *
 * The runtime's VERCEL_ENV discriminator is provided by Vercel. Production
 * is unaffected: this proxy returns NextResponse.next() immediately.
 */
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname

  // Fail closed for review-only UI: a streamed app-level notFound() may return
  // HTTP 200 in Next.js dev mode. The HTTP boundary must enforce a real 404.
  if (path === "/ui-design-system") {
    const hostedPreview = process.env.VERCEL_ENV === "preview"
    const localFixture = process.env.NODE_ENV === "development" && process.env.UI_VISUAL_FIXTURES === "1" && !process.env.VERCEL
    return hostedPreview || localFixture
      ? NextResponse.next()
      : new NextResponse("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } })
  }

  if (process.env.VERCEL_ENV !== "preview") return NextResponse.next()
  const safeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method)
  const triggersServerWrites =
    path.startsWith("/api/cron/") ||
    (path === "/api/draft" && request.nextUrl.searchParams.get("ensure") === "1")

  // Both write HTTP methods and existing mutating GET routes are denied.
  // This protects the real league even if Preview accidentally shares its DB.
  if (!safeMethod || triggersServerWrites) {
    return NextResponse.json(
      { error: "This is a read-only preview. Transactions and synchronization are disabled." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    )
  }

  // Once a dedicated preview database exists, safe GET endpoints may use it.
  // The write barrier remains active until reviewed separately.
  if (process.env.DATABASE_URL) return NextResponse.next()

  // Portrait lookup redirects do not require Prisma; use the actual NHL images.
  if (path === "/api/headshot") return NextResponse.next()

  const week = getCurrentFantasyWeek()
  const fixtures: Record<string, unknown> = {
    "/api/schedule": { date: new Date().toISOString().slice(0, 10), games: [], weekGames: [], playerGameLogs: {} },
    "/api/players": marketPlayers,
    "/api/messages": [],
    "/api/chat": [],
    "/api/trades": { offers: [], picks: [], teams: [] },
    "/api/activity": { activities },
    "/api/draft": { scheduled: null, draft: null },
    "/api/waivers": { faabBalance: 100, committedFaab: 0, claims: [] },
    "/api/news": { source: "DEMO", articles: [] },
    "/api/roster/week": { source: "live", currentWeek: week, frozen: false, assignments: [] },
    "/api/admin/league-settings": { name: "John Scott Dynasty (Demo)", rosterSize: 27 },
    "/api/admin/roles": { managers: [] },
    "/api/auth/session": { user: null },
  }

  if (Object.prototype.hasOwnProperty.call(fixtures, path)) {
    return NextResponse.json(fixtures[path], { headers: { "Cache-Control": "no-store" } })
  }

  return NextResponse.json(
    { error: "Endpoint unavailable in the database-free preview." },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

export const config = {
  matcher: ["/api/:path*", "/ui-design-system"],
}
