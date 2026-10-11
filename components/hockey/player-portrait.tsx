"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { getPlayerPhoto, type PlayerPortraitSource } from "@/lib/hockey-data"

export function PlayerPortrait({
  player,
  name,
  className,
}: {
  player?: PlayerPortraitSource
  name: string
  className?: string
}) {
  const [hasError, setHasError] = useState(false)
  const source = player ?? { name }
  const photo = getPlayerPhoto(source)
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  if (!photo || hasError) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full bg-[#1b2842] text-[9px] font-black text-[#8ba0c7]",
          className
        )}
      >
        {initials}
      </span>
    )
  }

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#1b2842]",
        className
      )}
    >
      <img
        src={photo}
        alt=""
        className="size-full scale-[1.35] object-cover object-[50%_18%]"
        onError={() => setHasError(true)}
      />
    </span>
  )
}
