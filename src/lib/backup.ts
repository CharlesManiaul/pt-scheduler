import { todayIso } from './format'
import { supabase } from './supabase'

// Full export of the therapist's data to one JSON file.
// Row Level Security means this only ever contains the signed-in account's rows.

const TABLES = ['settings', 'patients', 'care_plans', 'sessions', 'session_notes', 'payments'] as const
type Table = (typeof TABLES)[number]

const PAGE = 1000   // Supabase returns at most 1,000 rows per request by default

async function fetchAll(table: Table): Promise<unknown[]> {
  const rows: unknown[] = []
  // stable order so paging never skips or repeats a row
  const orderBy = table === 'settings' ? 'owner_id' : table === 'session_notes' ? 'session_id' : 'id'
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order(orderBy).range(from, from + PAGE - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export interface BackupResult { fileName: string; counts: Record<Table, number> }

/** Builds the backup and starts the download (iPhone: opens the share/save sheet). */
export async function downloadBackup(onProgress?: (table: Table) => void): Promise<BackupResult> {
  const data = {} as Record<Table, unknown[]>
  for (const table of TABLES) {
    onProgress?.(table)
    data[table] = await fetchAll(table)
  }
  const counts = Object.fromEntries(TABLES.map((t) => [t, data[t].length])) as Record<Table, number>
  const backup = {
    app: 'pt-scheduler',
    format: 1,
    exported_at: new Date().toISOString(),
    counts,
    data,
  }

  const fileName = `pt-scheduler-backup-${todayIso()}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)

  try { localStorage.setItem('pt-last-backup', new Date().toISOString()) } catch { /* private mode: ignore */ }
  return { fileName, counts }
}

export function lastBackupAt(): string | null {
  try { return localStorage.getItem('pt-last-backup') } catch { return null }
}
