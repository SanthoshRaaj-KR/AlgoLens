'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/', label: 'Deployments' },
  { href: '/probe', label: 'Probe' },
  { href: '/diff', label: 'Diff' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/search', label: 'Search' },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav className="border-b border-zinc-200 bg-white px-6 py-3 flex items-center gap-8">
      <span className="font-mono font-semibold text-zinc-900 text-sm tracking-tight">AlgoLens</span>
      <div className="flex items-center gap-6">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className={`text-sm font-mono ${
              path === l.href
                ? 'text-zinc-900 font-semibold'
                : 'text-zinc-400 hover:text-zinc-700'
            }`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  )
}
