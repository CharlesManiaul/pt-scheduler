// Turn Supabase/PostgREST/network errors into one plain-language sentence.
type MaybePgError = { code?: string; message?: string; details?: string | null }

export function toFriendlyError(error: unknown): string {
  if (error instanceof TypeError) return "Can't reach the server. Check your internet connection."
  const e = (error ?? {}) as MaybePgError

  switch (e.code) {
    case '23514': return 'Some values are outside the allowed range. Check the highlighted fields.'
    case '23502': return 'A required field is missing.'
    case '23503': return 'This record is linked to something that no longer exists.'
    case '23505': return 'This record already exists.'
    case '23P01': return 'This time overlaps another visit.'
    case '42501': return "You don't have permission to do that. Try signing out and in again."
    case 'PGRST116': return 'Record not found. It may have been removed.'
    case 'PGRST301':
    case 'PGRST303': return 'Your session expired. Sign in again.'
  }
  if (e.message?.includes('Failed to fetch')) return "Can't reach the server. Check your internet connection."
  return e.message || 'Something went wrong. Please try again.'
}
