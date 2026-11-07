// Signature motif: a dotted "rounds" route connecting home visits.
// The dotted line draws itself once on load (masked stroke animation).
export function RouteMotif({ className = '' }: { className?: string }) {
  const route = 'M24 168 C 80 168, 70 96, 132 96 S 196 40, 252 52 S 320 140, 372 120'
  const homes: Array<[number, number, number]> = [
    [24, 168, 0.4],
    [132, 96, 1.0],
    [252, 52, 1.6],
    [372, 120, 2.2],
  ]

  return (
    <svg viewBox="0 0 400 200" className={className} role="img" aria-label="A route connecting home visits">
      <defs>
        <mask id="route-reveal">
          <path d={route} fill="none" stroke="white" strokeWidth="8" strokeDasharray="600"
                className="animate-draw" />
        </mask>
      </defs>

      <path d={route} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
            strokeDasharray="1 9" mask="url(#route-reveal)" opacity="0.7" />

      {homes.map(([x, y, delay], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <g className="animate-rise" style={{ animationDelay: `${delay}s` }}>
            <circle r="17" fill={i === homes.length - 1 ? 'var(--color-clay-500)' : 'var(--color-card)'}
                    stroke="currentColor" strokeWidth="2" />
            <path d="M-7 3 V-3 L0 -9 L7 -3 V3 Z M-2.5 3 V-1 H2.5 V3" fill="none"
                  stroke={i === homes.length - 1 ? 'var(--color-card)' : 'currentColor'}
                  strokeWidth="1.8" strokeLinejoin="round" />
          </g>
        </g>
      ))}
    </svg>
  )
}
