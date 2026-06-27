import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Sidebar } from '@/components/sidebar'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AlgoLens',
  description: 'Behavioral complexity fingerprinting for HTTP endpoints',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} style={{ height: '100%' }}>
      <body style={{ display: 'flex', minHeight: '100%', background: 'var(--bg)', color: 'var(--text)', margin: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, padding: '36px 40px', overflowY: 'auto', minHeight: '100vh' }}>
          {children}
        </main>
      </body>
    </html>
  )
}
