export const TIME_ZONE = 'Asia/Manila'

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 })
export const formatPeso = (amount: number) => peso.format(amount)

/** Today's date in Manila as 'YYYY-MM-DD' (en-CA formats dates that way). */
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(new Date())
}

/** Whole years between a 'YYYY-MM-DD' birth date and today (Manila). */
export function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = todayIso().split('-').map(Number)
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0)
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: TIME_ZONE }).format(new Date(iso))
}

/** Opens Google Maps (app on phones) searching for the address. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}

/** tel: link that works with "0917 123 4567" or "+63 917-123-4567". */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')
}

// ---- dates & times -------------------------------------------------------
// Manila has no daylight saving, so a fixed +08:00 offset is always correct.
const MANILA_OFFSET = '+08:00'

export const WEEKDAYS: Array<{ iso: number; short: string; letter: string }> = [
  { iso: 1, short: 'Mon', letter: 'M' }, { iso: 2, short: 'Tue', letter: 'T' },
  { iso: 3, short: 'Wed', letter: 'W' }, { iso: 4, short: 'Thu', letter: 'T' },
  { iso: 5, short: 'Fri', letter: 'F' }, { iso: 6, short: 'Sat', letter: 'S' },
  { iso: 7, short: 'Sun', letter: 'S' },
]

/** 'YYYY-MM-DD' + 'HH:MM' (Manila wall clock) -> ISO timestamp with offset */
export function manilaIso(date: string, time: string): string {
  return `${date}T${time.slice(0, 5)}:00${MANILA_OFFSET}`
}

/** ISO timestamp -> { date: 'YYYY-MM-DD', time: 'HH:MM' } in Manila */
export function splitManila(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
  return { date, time }
}

/** ISO weekday (1=Mon..7=Sun) of a 'YYYY-MM-DD' date */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

/** "Mon, Nov 9" */
export function formatDay(isoOrDate: string): string {
  const d = isoOrDate.length === 10 ? new Date(`${isoOrDate}T12:00:00${MANILA_OFFSET}`) : new Date(isoOrDate)
  return new Intl.DateTimeFormat('en-PH', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' }).format(d)
}

/** "Mon, Nov 9 · 9:00 AM" */
export function formatVisit(iso: string): string {
  return `${formatDay(iso)} · ${formatTime(iso)}`
}

/** "09:00:00" -> "9:00 AM" */
export function formatClock(hhmm: string): string {
  return formatTime(manilaIso('2000-01-03', hhmm))
}

export function formatDays(days: number[]): string {
  return [...days].sort().map((n) => WEEKDAYS[n - 1]!.short).join(' · ')
}
