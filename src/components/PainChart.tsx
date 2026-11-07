import {
  CategoryScale, Chart, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from 'chart.js'
import { useEffect, useMemo, useRef } from 'react'
import { formatDay } from '../lib/format'
import type { NoteSummary } from '../lib/notes'

// register only what a line chart needs (keeps the bundle small)
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend)

// validated pair (lightness, chroma, colour-blind separation, contrast on the card surface)
const BEFORE = '#c8562f'   // terracotta, dashed
const AFTER = '#00897b'    // teal, solid
const INK_SOFT = '#4a5f5c'
const GRID = 'rgba(18, 48, 46, 0.08)'

/** Pain before/after per visit on one 0–10 axis. Visits without a score leave a gap. */
export function PainChart({ notes }: { notes: NoteSummary[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scored = useMemo(() => notes.filter((n) => n.pain_before !== null || n.pain_after !== null), [notes])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || scored.length === 0) return
    const chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: scored.map((n) => formatDay(n.starts_at)),
        datasets: [
          {
            label: 'Before visit', data: scored.map((n) => n.pain_before), borderColor: BEFORE, backgroundColor: BEFORE,
            borderWidth: 2, borderDash: [6, 4], pointRadius: 4, pointHoverRadius: 6, pointBorderColor: '#fffdf8', pointBorderWidth: 2, spanGaps: false, tension: 0.25,
          },
          {
            label: 'After visit', data: scored.map((n) => n.pain_after), borderColor: AFTER, backgroundColor: AFTER,
            borderWidth: 2, pointRadius: 4, pointHoverRadius: 6, pointBorderColor: '#fffdf8', pointBorderWidth: 2, spanGaps: false, tension: 0.25,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        interaction: { mode: 'index', intersect: false },     // crosshair-style: both values for the hovered visit
        scales: {
          y: {
            min: 0, max: 10,
            ticks: { stepSize: 2, color: INK_SOFT, font: { family: 'Figtree Variable', size: 11 } },
            grid: { color: GRID },
            border: { display: false },
            title: { display: true, text: 'Pain (0–10)', color: INK_SOFT, font: { family: 'Figtree Variable', size: 11 } },
          },
          x: {
            ticks: { color: INK_SOFT, font: { family: 'Figtree Variable', size: 11 }, maxRotation: 0, autoSkipPadding: 12 },
            grid: { display: false },
            border: { color: GRID },
          },
        },
        plugins: {
          legend: {
            position: 'top', align: 'end',
            labels: { usePointStyle: true, pointStyle: 'line', boxWidth: 24, color: INK_SOFT, font: { family: 'Figtree Variable', size: 12 } },
          },
          tooltip: {
            backgroundColor: '#12302e', titleFont: { family: 'Figtree Variable', weight: 600 }, bodyFont: { family: 'Figtree Variable' },
            padding: 10, cornerRadius: 8, displayColors: true, boxPadding: 4,
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y ?? '–'} / 10` },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [scored])

  if (scored.length === 0) {
    return <p className="text-sm text-ink-soft">No pain scores yet. Record them in a visit’s notes to see the trend here.</p>
  }

  const first = scored[0]!, last = scored[scored.length - 1]!
  const firstScore = first.pain_before ?? first.pain_after
  const lastScore = last.pain_after ?? last.pain_before
  return (
    <div>
      {scored.length > 1 && firstScore !== null && lastScore !== null && (
        <p className="mb-2 text-sm text-ink-soft">
          From <b className="text-ink">{firstScore}</b> on {formatDay(first.starts_at)} to <b className="text-ink">{lastScore}</b> on {formatDay(last.starts_at)}
        </p>
      )}
      <div className="relative h-56">
        <canvas ref={canvasRef} role="img" aria-label={`Pain scores for ${scored.length} visits, before and after each visit`} />
      </div>
    </div>
  )
}
