import { notFound } from "next/navigation"
import { DesignSystemGallery } from "@/components/hockey/design-system-gallery"

/** Review-only gallery. Never expose UI fixtures on the production domain. */
export default function DesignSystemPreview() {
  const hostedPreview = process.env.VERCEL_ENV === "preview"
  const localFixture = process.env.NODE_ENV === "development" && process.env.UI_VISUAL_FIXTURES === "1" && !process.env.VERCEL
  if (!hostedPreview && !localFixture) notFound()
  return <DesignSystemGallery />
}
