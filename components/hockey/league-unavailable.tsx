export function LeagueUnavailable({ reason = "connection" }: { reason?: "connection" | "missing" }) {
  return (
    <main data-testid="league-unavailable" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center gap-5 border-x border-[#172338] bg-[#070a12] px-6 text-center text-white">
      <div aria-hidden="true" className="flex size-14 items-center justify-center rounded-2xl border border-[#27415a] bg-[#112136] text-2xl">🏒</div>
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8ba0c7]">John Scott Dynasty</p>
        <h1 className="text-xl font-bold">League data unavailable</h1>
        <p className="text-sm leading-6 text-[#a5b8d1]">
          {reason === "missing"
            ? "No league has been loaded from the database for this deployment."
            : "The league database could not be reached. Scores, rosters, and standings are temporarily unavailable."}
        </p>
        <p className="text-xs leading-5 text-[#8ba0c7]">
          Sample rosters and scores are never substituted for live league data.
        </p>
      </div>
      <a href="/" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#19ffff] px-6 text-sm font-bold text-[#19ffff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#19ffff]">
        Retry loading
      </a>
    </main>
  )
}
