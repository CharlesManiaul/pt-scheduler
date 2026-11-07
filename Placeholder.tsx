// Temporary page for sections built in later steps.
export function Placeholder({ title, step, description }: { title: string; step: string; description: string }) {
  return (
    <section className="animate-rise">
      <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-card/70 p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-clay-600">Coming in {step}</p>
        <p className="mt-2 text-ink-soft">{description}</p>
      </div>
    </section>
  )
}
