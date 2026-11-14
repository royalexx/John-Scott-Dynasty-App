export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">John Scott Dynasty</p>
      <p role="status" aria-live="polite" className="mt-3 text-sm font-semibold text-text-secondary">Loading the league...</p>
    </main>
  )
}
