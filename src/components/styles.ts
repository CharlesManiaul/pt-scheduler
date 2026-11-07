// Class-name helpers shared by components (kept apart from components for fast refresh).

export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-clay-500 text-white shadow-[0_6px_16px_-8px_var(--color-clay-600)] hover:bg-clay-600',
  secondary: 'border border-line bg-card text-ink hover:border-teal-600 hover:text-teal-700',
  ghost: 'text-ink-soft hover:bg-card hover:text-ink',
  danger: 'bg-danger-600 text-white hover:brightness-110',
}

export function buttonClass(variant: Variant = 'primary', extra = '') {
  return `inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${extra}`
}

export function inputClass(hasError = false) {
  return [
    'w-full rounded-xl border bg-paper/60 px-4 text-base text-ink placeholder:text-ink-faint',
    'transition outline-none focus:bg-card focus:ring-4',
    hasError ? 'border-danger-600 focus:ring-danger-50' : 'border-line focus:border-teal-600 focus:ring-teal-600/15',
  ].join(' ')
}

