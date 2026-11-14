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
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null)
  const source = player ?? { name }
  const photo = getPlayerPhoto(source)
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  if (!photo || failedPhoto === photo) {
    return (
      <span
        data-slot="player-portrait"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border border-border bg-surface-raised text-xs font-bold text-text-secondary",
          className
        )}
      >
        {initials}
      </span>
    )
  }

  return (
    <span
      data-slot="player-portrait"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-surface-raised",
        className
      )}
    >
      <img
        src={photo}
        alt=""
        className="size-full scale-[1.35] object-cover object-[50%_18%]"
        onError={() => setFailedPhoto(photo)}
      />
    </span>
  )
}
