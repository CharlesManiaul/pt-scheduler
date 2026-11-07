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
