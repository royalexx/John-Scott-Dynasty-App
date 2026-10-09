import { NextResponse } from "next/server"

type EspnArticle = {
  id: number
  headline?: string
  description?: string
  published?: string
  links?: { web?: { href?: string } }
}

export async function GET(request: Request) {
  const player = new URL(request.url).searchParams.get("player")?.trim().toLowerCase()
  const response = await fetch("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/news?limit=50", {
    headers: { Accept: "application/json", "User-Agent": "JohnScottDynasty/1.0" },
    next: { revalidate: 300 },
  })
  if (!response.ok) {
    return NextResponse.json({ error: "ESPN news feed unavailable" }, { status: 502 })
  }
  const data = await response.json() as { articles?: EspnArticle[] }
  const articles = (data.articles ?? [])
    .filter((article) => !player || `${article.headline ?? ""} ${article.description ?? ""}`.toLowerCase().includes(player))
    .map((article) => ({
      id: String(article.id),
      headline: article.headline ?? "NHL update",
      description: article.description ?? "",
      published: article.published ?? null,
      url: article.links?.web?.href ?? null,
    }))
  return NextResponse.json({ source: "ESPN", articles })
}
