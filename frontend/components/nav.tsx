'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/',         label: 'Deployments' },
  { href: '/probe',    label: 'Probe' },
  { href: '/diff',     label: 'Diff' },
  { href: '/timeline', label: 'Timeline' },
  { href: '/search',   label: 'Search' },
]

export function Nav() {
  const path = usePathname()
  return (
    <nav
      style={{
        borderBottom: '1px solid #1e293b',
        backgroundColor: 'rgba(2,6,23,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            paddingTop: 14,
            paddingBottom: 14,
            marginRight: 16,
            textDecoration: 'none',
          }}
        >
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
              letterSpacing: '-0.01em',
            }}
          >
            AL
          </span>
          <span
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: '#f1f5f9',
              letterSpacing: '-0.02em',
            }}
          >
            AlgoLens
          </span>
        </Link>

        {/* Nav links */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 2 }}>
          {links.map(l => {
            const active = path === l.href
            return (
              <Link
                key={l.href}
                href={l.href}
                style={{
                  position: 'relative',
                  padding: '14px 12px',
                  fontSize: 13,
                  fontFamily: 'var(--font-geist-mono)',
                  fontWeight: active ? 600 : 400,
                  color: active ? '#f1f5f9' : '#64748b',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                  borderBottom: active ? '2px solid #6366f1' : '2px solid transparent',
                }}
              >
                {l.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
