import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { Icon } from './Icon'
import { buttonClass, type Variant } from './styles'

// Shared building blocks so every screen looks and behaves the same.

export function Button({ variant = 'primary', loading = false, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...rest} disabled={rest.disabled || loading} className={buttonClass(variant, className)}>
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function ButtonLink({ variant = 'primary', className = '', ...rest }: LinkProps & { variant?: Variant }) {
  return <Link {...rest} className={buttonClass(variant, className)} />
}

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <span className={`${className} animate-spin rounded-full border-2 border-current border-t-transparent`} aria-hidden />
}

export function Field({ label, htmlFor, error, hint, optional, children }: {
  label: string
  htmlFor: string
  error?: string | null
  hint?: string
  optional?: boolean
  children: ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink">
        {label}
        {optional && <span className="text-xs font-normal text-ink-faint">optional</span>}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="mt-1.5 text-sm text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl bg-danger-50 p-4 text-sm text-danger-600">
      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <button onClick={onRetry} className="font-semibold underline underline-offset-2">Try again</button>
      )}
    </div>
  )
}

export function StatusBadge({ status }: { status: 'active' | 'discharged' }) {
  return status === 'active' ? (
    <span className="rounded-full bg-teal-600/10 px-2.5 py-0.5 text-xs font-semibold text-teal-700">Active</span>
  ) : (
    <span className="rounded-full bg-paper-deep px-2.5 py-0.5 text-xs font-semibold text-ink-soft">Discharged</span>
  )
}

/** Accessible modal built on <dialog>: Esc closes, focus stays inside, page behind is inert. */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      onCancel={(e) => { e.preventDefault(); onClose() }}
      aria-label={title}
      className={`m-auto max-h-[calc(100dvh-2rem)] ${wide ? 'w-[min(32rem,calc(100%-1.5rem))]' : 'w-[min(26rem,calc(100%-1.5rem))]'} overflow-y-auto overscroll-contain rounded-2xl border border-line bg-card p-5 text-ink shadow-card backdrop:bg-ink/40 sm:p-6`}
    >
      {open && (
        <>
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <button onClick={onClose} aria-label="Close" className="-mt-1 -mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-faint hover:bg-paper hover:text-ink">
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3">{children}</div>
        </>
      )}
    </dialog>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, variant = 'primary', busy, onConfirm, onCancel }: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  variant?: Variant
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <div className="text-sm text-ink-soft">{body}</div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={variant} onClick={onConfirm} loading={busy}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

/** Dismissible success/info message shown at the top of a page after an action. */
export function Notice({ tone = 'success', children, onDismiss }: { tone?: 'success' | 'warning'; children: ReactNode; onDismiss: () => void }) {
  const tones = { success: 'border-moss-600/25 bg-moss-600/10 text-ink', warning: 'border-clay-500/30 bg-clay-50 text-ink' }
  return (
    <div role="status" className={`animate-rise flex items-start gap-3 rounded-xl border p-3.5 text-sm ${tones[tone]}`}>
      <div className="flex-1">{children}</div>
      <button onClick={onDismiss} aria-label="Dismiss" className="text-ink-faint hover:text-ink"><Icon name="close" className="h-4 w-4" /></button>
    </div>
  )
}
