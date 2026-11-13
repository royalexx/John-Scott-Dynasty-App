"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { HockeySurface, HockeySectionHeading, HockeyStatus, HockeyStat, PositionBadge } from "@/components/ui/hockey"
import { PlayerPortrait } from "@/components/hockey/player-portrait"
import { TradeBuilderDialog, type TradeTeam } from "@/components/hockey/trade-builder-dialog"
import { roster } from "@/lib/hockey-data"

// Component-only sample managers. The entire gallery is inaccessible in Production.
const demoSender: TradeTeam = {
  id: "preview-home", name: "Sample Home", players: roster.slice(0, 5),
  faabAvailable: 75,
  draftPicks: [{ id: "demo-home-pick", label: "2027 1st Round" }],
}
const demoPartner: TradeTeam = {
  id: "preview-away", name: "Sample Opponent", players: roster.slice(5, 10),
  faabAvailable: 60,
  draftPicks: [{ id: "demo-away-pick", label: "2027 2nd Round" }],
}

const palette = [
  { label: "Canvas", token: "--ds-canvas" },
  { label: "Surface", token: "--ds-surface" },
  { label: "Elevated", token: "--ds-surface-raised" },
  { label: "Border", token: "--ds-border" },
  { label: "Primary text", token: "--ds-text" },
  { label: "Secondary", token: "--ds-text-secondary" },
  { label: "Muted text", token: "--ds-text-muted" },
  { label: "Cyan accent", token: "--ds-accent" },
  { label: "Success", token: "--ds-success" },
  { label: "Warning", token: "--ds-warning" },
  { label: "Danger", token: "--ds-danger" },
]

/**
 * Safe design-review surface: no API writes or manager data. It renders the
 * real shared components instead of static design approximations.
 */
export function DesignSystemGallery() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [tradeOpen, setTradeOpen] = useState(false)
  const [message, setMessage] = useState("Select a button to check its interaction state.")
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main data-testid="design-system-gallery" className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col gap-6 border-x border-border bg-background p-4 pb-12">
        <header className="space-y-2 border-b border-border pb-5">
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">John Scott Dynasty · Design review</p>
          <h1 className="text-2xl font-bold leading-tight">Interface foundations</h1>
          <p className="text-sm leading-6 text-text-secondary">Phase 2 preview · component examples and sample players only · no saved changes</p>
          <HockeyStatus label="Preview only" tone="warning" />
        </header>

        <section className="space-y-3">
          <HockeySectionHeading title="Color hierarchy" eyebrow="Semantic palette" />
          <div className="grid grid-cols-3 gap-2">
            {palette.map(({ label, token }) => <div key={token} className="min-w-0 space-y-1.5">
              <div className="h-12 rounded-xl border border-border" style={{ backgroundColor: `var(${token})` }} />
              <p className="truncate text-xs font-semibold text-text-secondary">{label}</p>
            </div>)}
          </div>
        </section>

        <HockeySurface className="space-y-4">
          <HockeySectionHeading title="Player identity" eyebrow="Portraits retained" action={<HockeyStatus label="Real NHL photos" tone="success" />} />
          <div className="flex items-center gap-3 border-b border-border pb-3">
            <PlayerPortrait name="Nathan MacKinnon" player={{ name: "Nathan MacKinnon", nhlId: 8477492 }} className="size-10" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Nathan MacKinnon</p>
              <p className="text-xs text-text-secondary">COL · C · Sample roster</p>
            </div>
            <PositionBadge position="C" />
            <HockeyStat label="Proj." value="17.8" />
          </div>
          <div className="flex items-center gap-3">
            <PlayerPortrait name="Connor McDavid" player={{ name: "Connor McDavid", nhlId: 8478402 }} className="size-16" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">Connor McDavid</p>
              <p className="text-xs text-text-secondary">EDM · C · Larger profile</p>
              <HockeyStatus label="Healthy" tone="success" className="mt-1" />
            </div>
            <PositionBadge position="C" />
          </div>
        </HockeySurface>

        <section className="space-y-3">
          <HockeySectionHeading title="Actions" eyebrow="44px primary hit areas" />
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={() => setMessage("Primary action selected")}>Primary</Button>
            <Button variant="secondary" onClick={() => setMessage("Secondary action selected")}>Secondary</Button>
            <Button variant="outline" onClick={() => setSheetOpen(true)}>Open sheet</Button>
            <Button variant="ghost" onClick={() => setMessage("Ghost action selected")}>Ghost</Button>
          </div>
          <p data-testid="gallery-action-feedback" aria-live="polite" className="text-xs text-text-secondary">{message}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => setMessage("Compact action selected")}>Compact</Button>
            <Button size="xs" onClick={() => setMessage("Extra-compact action selected")}>Dense</Button>
            <Button disabled>Disabled</Button>
          </div>
        </section>

        <HockeySurface className="space-y-4" elevated>
          <HockeySectionHeading title="Stats and states" eyebrow="Reusable atoms" />
          <div className="grid grid-cols-3 gap-2">
            <HockeyStat label="Actual" value="74.5" detail="FPTS" />
            <HockeyStat label="Projected" value="120.8" detail="FPTS" />
            <HockeyStat label="FAAB" value="$72" detail="Remaining" />
          </div>
          <div className="flex flex-wrap gap-2">
            <HockeyStatus label="Live" tone="live" />
            <HockeyStatus label="Complete" tone="success" />
            <HockeyStatus label="DTD" tone="warning" />
            <HockeyStatus label="Injured" tone="danger" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {["C", "W", "F", "D", "G", "BN", "TAXI", "IR"].map((position) => <PositionBadge key={position} position={position} />)}
          </div>
          <div className="flex gap-2">
            <Badge>Default badge</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="destructive">Alert</Badge>
          </div>
        </HockeySurface>

        <section className="space-y-3">
          <HockeySectionHeading title="Navigation" eyebrow="Native Base UI tabs" />
          <Tabs defaultValue="weekly">
            <TabsList variant="line" className="w-full">
              <TabsTrigger value="weekly">Week</TabsTrigger>
              <TabsTrigger value="season">Season</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>
            <TabsContent value="weekly" className="rounded-xl border border-border bg-surface p-4 text-text-secondary">Selected week · tab state is interactive</TabsContent>
            <TabsContent value="season" className="rounded-xl border border-border bg-surface p-4 text-text-secondary">2026–27 season totals</TabsContent>
            <TabsContent value="history" className="rounded-xl border border-border bg-surface p-4 text-text-secondary">Historical results</TabsContent>
          </Tabs>
        </section>

        <HockeySurface className="space-y-3">
          <HockeySectionHeading title="Trade workflow" eyebrow="Read-only fixture, no persistence" />
          <p className="text-xs text-text-secondary">Preview the real three-step builder with sample managers, players and picks.</p>
          <Button onClick={() => setTradeOpen(true)}>Review trade workflow</Button>
        </HockeySurface>

        <HockeySurface className="space-y-3">
          <HockeySectionHeading title="Type scale" eyebrow="Labels to screen titles" />
          <p className="text-2xl font-bold">Screen heading · 24px</p>
          <p className="text-lg font-bold">Section heading · 18px</p>
          <p className="text-sm">Body / player name · 14px</p>
          <p className="text-xs text-text-muted">Secondary metadata · 12px</p>
        </HockeySurface>
        <footer className="text-center text-xs text-text-muted">Review fixture only. Fantasy data, portraits and actions in the real app are unchanged.</footer>
      </main>

      <TradeBuilderDialog
        open={tradeOpen}
        onOpenChange={setTradeOpen}
        team={demoSender}
        partners={[demoPartner]}
        onSendTrade={() => { setTradeOpen(false); setMessage("Preview only · No trade saved") }}
      />
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="mx-auto w-full max-w-[430px] rounded-t-2xl border-t border-border bg-popover p-4 text-foreground">
          <SheetHeader className="px-0"><SheetTitle>Example bottom sheet</SheetTitle></SheetHeader>
          <p className="text-sm text-text-secondary">Shared surface, spacing, focus and close interaction.</p>
          <Button onClick={() => setSheetOpen(false)}>Close sheet</Button>
        </SheetContent>
      </Sheet>
    </div>
  )
}
