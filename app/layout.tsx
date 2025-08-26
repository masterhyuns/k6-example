import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Next.js k6 Performance Test',
  description: 'Performance testing example with k6 and Next.js',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}