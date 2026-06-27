import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="py-16 text-center space-y-3">
      <p className="text-xs font-mono text-zinc-400">404 — not found</p>
      <Link href="/" className="text-xs font-mono text-zinc-500 hover:text-zinc-800 underline">
        back to deployments
      </Link>
    </div>
  )
}
