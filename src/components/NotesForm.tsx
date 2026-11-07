import { useEffect, useState } from 'react'
import { toFriendlyError } from '../lib/errors'
import { formatVisit } from '../lib/format'
import { getNote, getPreviousNote, saveNote, type NoteFields, type NoteSummary } from '../lib/notes'
import { inputClass } from './styles'
import { Button, ErrorBanner, Spinner } from './ui'

const SOAP: Array<{ key: 'subjective' | 'objective' | 'assessment' | 'plan'; label: string; hint: string }> = [
  { key: 'subjective', label: 'S — Subjective', hint: 'What the patient reports: pain, sleep, function since last visit' },
  { key: 'objective', label: 'O — Objective', hint: 'Measurements: ROM, MMT, vitals, gait, tests done' },
  { key: 'assessment', label: 'A — Assessment', hint: 'Your interpretation: progress toward goals' },
  { key: 'plan', label: 'P — Plan', hint: 'Next visit focus, home exercise program' },
]

const EMPTY: NoteFields = { subjective: null, objective: null, assessment: null, plan: null, pain_before: null, pain_after: null }
const MAX = 4000

/**
 * SOAP note + pain before/after for one visit. Loads the existing note (if any)
 * and the previous visit's note for reference.
 */
export function NotesForm({ sessionId, patientId, startsAt, onSaved, onCancel, cancelLabel = 'Cancel' }: {
  sessionId: string
  patientId: string
  startsAt: string
  onSaved: () => void
  onCancel: () => void
  cancelLabel?: string
}) {
  const [fields, setFields] = useState<NoteFields | null>(null)
  const [exists, setExists] = useState(false)
  const [previous, setPrevious] = useState<NoteSummary | null>(null)
  const [showPrevious, setShowPrevious] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getNote(sessionId), getPreviousNote(patientId, startsAt)])
      .then(([note, prev]) => {
        if (cancelled) return
        setExists(Boolean(note))
        setFields(note ? {
          subjective: note.subjective, objective: note.objective, assessment: note.assessment,
          plan: note.plan, pain_before: note.pain_before, pain_after: note.pain_after,
        } : EMPTY)
        setPrevious(prev)
      })
      .catch((e) => !cancelled && setLoadError(toFriendlyError(e)))
    return () => { cancelled = true }
  }, [sessionId, patientId, startsAt])

  if (loadError) return <ErrorBanner message={loadError} />
  if (!fields) return <div className="grid place-items-center py-10 text-teal-700"><Spinner className="h-6 w-6" /></div>

  const set = <K extends keyof NoteFields>(key: K, value: NoteFields[K]) => setFields((f) => (f ? { ...f, [key]: value } : f))
  const isEmpty = SOAP.every(({ key }) => !fields[key]?.trim()) && fields.pain_before === null && fields.pain_after === null

  async function save() {
    if (!fields) return
    setSaving(true)
    setError(null)
    const clean: NoteFields = {
      ...fields,
      subjective: fields.subjective?.trim() || null, objective: fields.objective?.trim() || null,
      assessment: fields.assessment?.trim() || null, plan: fields.plan?.trim() || null,
    }
    try {
      await saveNote(sessionId, clean, exists)
      onSaved()
    } catch (e) {
      setError(toFriendlyError(e))
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {previous && (
        <div className="rounded-xl border border-line bg-paper/70">
          <button type="button" onClick={() => setShowPrevious((v) => !v)} aria-expanded={showPrevious}
                  className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-sm">
            <span><span className="font-semibold">Last visit</span> <span className="text-ink-faint">· {formatVisit(previous.starts_at)}</span></span>
            <span className="text-xs font-medium text-teal-700">{showPrevious ? 'Hide' : 'Show'}</span>
          </button>
          {showPrevious && (
            <div className="space-y-2 border-t border-line px-3.5 py-3 text-sm">
              {(previous.pain_before !== null || previous.pain_after !== null) && (
                <p className="text-ink-soft">Pain {previous.pain_before ?? '–'} → {previous.pain_after ?? '–'}</p>
              )}
              {SOAP.map(({ key, label }) => previous[key] && (
                <p key={key}><span className="font-semibold">{label.charAt(0)}:</span> <span className="whitespace-pre-line">{previous[key]}</span></p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <PainScale label="Pain before" value={fields.pain_before} onChange={(v) => set('pain_before', v)} />
        <PainScale label="Pain after" value={fields.pain_after} onChange={(v) => set('pain_after', v)} />
      </div>

      {SOAP.map(({ key, label, hint }) => (
        <div key={key}>
          <label htmlFor={`note_${key}`} className="mb-1 block text-sm font-semibold">{label}</label>
          <textarea
            id={`note_${key}`}
            rows={key === 'objective' ? 4 : 3}
            maxLength={MAX}
            value={fields[key] ?? ''}
            onChange={(e) => set(key, e.target.value)}
            placeholder={hint}
            className={`${inputClass()} py-3 text-[0.95rem] leading-relaxed`}
          />
        </div>
      ))}

      {error && <ErrorBanner message={error} />}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={saving}>{cancelLabel}</Button>
        <Button className="flex-1" loading={saving} disabled={isEmpty && !exists} onClick={save}>
          {exists ? 'Save changes' : 'Save notes'}
        </Button>
      </div>
    </div>
  )
}

/** 0–10 pain picker; tap the selected number again to clear it. */
export function PainScale({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 flex w-full items-baseline justify-between text-sm font-semibold">
        {label}
        <span className="text-xs font-normal text-ink-faint">{value === null ? 'not recorded' : `${value} / 10`}</span>
      </legend>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            aria-pressed={value === n}
            aria-label={`${label}: ${n}`}
            className={`h-10 rounded-lg text-sm font-semibold transition ${
              value === n ? 'bg-teal-700 text-white shadow-card' : 'border border-line bg-paper/60 text-ink-soft hover:border-teal-600'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[0.65rem] text-ink-faint"><span>no pain</span><span>worst</span></div>
    </fieldset>
  )
}
