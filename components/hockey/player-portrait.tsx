import { cn } from "@/lib/utils"
import { getPlayerPhoto, type PlayerPortraitSource } from "@/lib/hockey-data"
import { useState } from "react"

export function PlayerPortrait({
  player,
  name,
  className,
}: {
  player?: PlayerPortraitSource
  name: string
  className?: string
}) {
  const [loaded, setLoaded] = useState(false)
  const source = player ?? { name }
  const photo = getPlayerPhoto(source)
  const initials = name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()

  return (
    <span className={cn("relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1b2842] text-[9px] font-black text-[#8ba0c7]", className)}>
      {photo && (
        <img
          src={photo}
          alt=""
          className="size-full scale-[1.35] object-cover object-[50%_18%]"
          onLoad={() => setLoaded(true)}
          onError={(event) => {
            setLoaded(false)
            event.currentTarget.style.display = "none"
          }}
        />
      )}
      {!loaded && <span aria-hidden="true">{initials}</span>}
    </span>
  )
}
