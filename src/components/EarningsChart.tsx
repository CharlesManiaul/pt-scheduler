import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js'
import { useEffect, useRef } from 'react'
import { formatPeso } from '../lib/format'

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip)

const BAR = '#00897b'        // validated teal (same as "after" in the pain chart)
const CURRENT = '#c8562f'    // this month, still in progress
const INK_SOFT = '#4a5f5c'
const GRID = 'rgba(18, 48, 46, 0.08)'

const monthShort = (m: string) =>
  new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m}-01T00:00:00Z`))

/** Collected per month; one series, so no legend — the card title names it. */
export function EarningsChart({ data }: { data: Array<{ month: string; total: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!ref.current) return
    const chart = new Chart(ref.current, {
      type: 'bar',
      data: {
        labels: data.map((d) => monthShort(d.month)),
        datasets: [{
          data: data.map((d) => d.total),
          backgroundColor: data.map((_, i) => (i === data.length - 1 ? CURRENT : BAR)),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          maxBarThickness: 36,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: INK_SOFT, font: { family: 'Figtree Variable', size: 11 }, maxTicksLimit: 5,
                     callback: (v) => (Number(v) >= 1000 ? `₱${Number(v) / 1000}k` : `₱${v}`) },
            grid: { color: GRID }, border: { display: false },
          },
          x: { ticks: { color: INK_SOFT, font: { family: 'Figtree Variable', size: 11 } }, grid: { display: false }, border: { color: GRID } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#12302e', padding: 10, cornerRadius: 8, displayColors: false,
            titleFont: { family: 'Figtree Variable', weight: 600 }, bodyFont: { family: 'Figtree Variable' },
            callbacks: {
              title: (items) => data[items[0]!.dataIndex]!.month === data.at(-1)!.month ? `${items[0]!.label} (so far)` : items[0]!.label,
              label: (ctx) => formatPeso(Number(ctx.parsed.y)),
            },
          },
        },
      },
    })
    return () => chart.destroy()
  }, [data])

  return (
    <div className="relative h-44">
      <canvas ref={ref} role="img"
              aria-label={`Collected per month: ${data.map((d) => `${monthShort(d.month)} ${formatPeso(d.total)}`).join(', ')}`} />
    </div>
  )
}
