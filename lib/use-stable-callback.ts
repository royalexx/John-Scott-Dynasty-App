import { useCallback, useLayoutEffect, useRef } from "react"

/**
 * Returns a function with a permanently stable identity that always invokes the latest `callback`.
 * Lets large parents hand handlers to `React.memo` children without re-rendering them every render.
 */
export function useStableCallback<Args extends unknown[], Result>(callback: (...args: Args) => Result): (...args: Args) => Result {
  const ref = useRef(callback)
  useLayoutEffect(() => {
    ref.current = callback
  })
  return useCallback((...args: Args) => ref.current(...args), [])
}
