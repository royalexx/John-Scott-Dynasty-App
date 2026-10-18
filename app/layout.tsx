import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const viewport: Viewport = {
  themeColor: '#070a12',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
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
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark bg-[#070a12] text-white">
      <body className="pointer-events-auto min-h-screen bg-[#070a12] antialiased overscroll-none pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
        {children}
        <Analytics />
      </body>
    </html>
  )
}