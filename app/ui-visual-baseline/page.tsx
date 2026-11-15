import { notFound } from "next/navigation"
import { PinGate, type PinGateTeam } from "@/components/auth/pin-gate"

// Development-only screen used for baseline screenshots. No production route.
const mockTeams: PinGateTeam[] = [
  { id: "fixture-mtl", name: "Montreal Monarchs", managerId: "fixture-manager-1", managerName: "Sample Manager", managerHandle: "manager1" },
  { id: "fixture-bos", name: "Boston Blades", managerId: "fixture-manager-2", managerName: "Second Manager", managerHandle: "manager2" },
  { id: "fixture-van", name: "Vancouver Orcas", managerId: "fixture-manager-3", managerName: "Third Manager", managerHandle: "manager3" },
  { id: "fixture-ott", name: "Ottawa Owls", managerId: "fixture-manager-4", managerName: "Fourth Manager", managerHandle: "manager4" },
]

export default function VisualBaselineLogin() {
  if (process.env.NODE_ENV !== "development" || process.env.UI_VISUAL_FIXTURES !== "1" || process.env.VERCEL) {
    notFound()
  }

  return <PinGate teams={mockTeams} />
}
