export default function Loading() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-48" />
      <div className="card">
        <div className="card-body space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      </div>
    </div>
  )
}
