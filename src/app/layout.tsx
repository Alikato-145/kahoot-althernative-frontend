import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Camp Quiz',
  description: 'Thai camp quiz game',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  )
}
