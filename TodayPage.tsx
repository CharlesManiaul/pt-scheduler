import { useState } from 'react'

const TIME_ZONE = 'Asia/Manila'

function greeting(now: Date): string {
  const hour = Number(new Intl.DateTimeFormat('en-PH', { hour: 'numeric', hourCycle: 'h23', timeZone: TIME_ZONE }).format(now))
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function TodayPage() {
  // captured once per visit to the page; keeps render pure
  const [now] = useState(() => new Date())
  const dateLabel = new Intl.DateTimeFormat('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: TIME_ZONE,
  }).format(now)

  return (
    <section>
      <p className="animate-rise text-sm font-semibold uppercase tracking-[0.18em] text-clay-600">{dateLabel}</p>
      <h1 className="animate-rise mt-2 font-display text-4xl font-semibold tracking-tight [animation-delay:80ms] sm:text-5xl">
        {greeting(now)}.
      </h1>

      <div className="animate-rise mt-8 rounded-2xl border border-dashed border-line bg-card/70 p-6 [animation-delay:160ms]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-600">Signed in</p>
        <p className="mt-2 text-ink-soft">
          Login works. Today's route list (visits in order, travel gaps, unpaid sessions) arrives with the
          dashboard step.
        </p>
      </div>
    </section>
  )
}
