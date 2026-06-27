import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="py-24 text-center space-y-4 animate-fade-up">
      <p style={{ fontSize: 72, lineHeight: 1 }}>404</p>
      <p style={{ color: '#475569', fontFamily: 'var(--font-geist-mono)', fontSize: 14 }}>Page not found</p>
      <Link href="/" className="btn-secondary" style={{ display: 'inline-flex', marginTop: 8 }}>
        ← Back to deployments
      </Link>
    </div>
  )
}
