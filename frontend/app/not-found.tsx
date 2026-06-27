import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="anim-fade-up" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 16, textAlign: 'center' }}>
      <div className="gradient-text" style={{ fontSize: 80, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>404</div>
      <p style={{ color: 'var(--text-2)', fontFamily: 'var(--font-geist-mono)', fontSize: 14, margin: 0 }}>Page not found</p>
      <Link href="/" className="btn-secondary" style={{ marginTop: 8 }}>← Back to Deployments</Link>
    </div>
  )
}
