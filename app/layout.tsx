import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#070a12',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover', // Ensures the app flows beneath the iPhone notch & Dynamic Island
}

export const metadata: Metadata = {
  title: 'John Scott Dynasty',
  description: 'Authentic Sleeper-style fantasy dynasty hockey',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'John Scott Dynasty',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark bg-background text-foreground">
      <body className="pointer-events-auto min-h-dvh bg-background antialiased overscroll-none">
        {children}
        <Analytics />
      </body>
    </html>
  )
}