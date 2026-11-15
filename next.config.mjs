/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Keep the Next.js dev badge from covering mobile screenshot review surfaces.
  devIndicators: false,
}

export default nextConfig
