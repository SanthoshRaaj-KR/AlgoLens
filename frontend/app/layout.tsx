import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Nav } from '@/components/nav'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AlgoLens',
  description: 'Behavioral complexity fingerprinting for HTTP endpoints',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-white text-zinc-900 flex flex-col">
        <Nav />
        <main className="flex-1 px-6 py-6 max-w-6xl mx-auto w-full">
          {children}
        </main>
      </body>
    </html>
  )
}
