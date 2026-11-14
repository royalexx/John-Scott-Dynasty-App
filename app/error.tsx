"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center bg-background px-6 text-center text-foreground">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-brand">John Scott Dynasty</p>
      <h1 className="mt-3 text-xl font-black">Something went wrong</h1>
      <p role="alert" className="mt-2 text-sm leading-relaxed text-text-secondary">The dashboard hit an unexpected error. You can try loading this screen again.</p>
      {error.digest ? <p className="mt-2 text-xs text-text-muted">Reference {error.digest}</p> : null}
      <button type="button" onClick={() => reset()} className="mt-6 min-h-11 rounded-full bg-brand px-6 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Retry
      </button>
    </main>
  )
}
