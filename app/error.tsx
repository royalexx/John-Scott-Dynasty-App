"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col items-center justify-center bg-[#070a12] px-6 text-center text-white">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-[#19ffff]">John Scott Dynasty</p>
      <h1 className="mt-3 text-xl font-black">Something went wrong</h1>
      <p className="mt-2 text-sm leading-relaxed text-[#8ba0c7]">The dashboard hit an unexpected error. You can try loading this screen again.</p>
      {error.digest ? <p className="mt-2 text-xs text-[#5e7090]">Reference {error.digest}</p> : null}
      <button type="button" onClick={() => reset()} className="mt-6 h-11 rounded-full bg-[#19ffff] px-6 text-sm font-black text-[#080c14]">
        Retry
      </button>
    </main>
  )
}
