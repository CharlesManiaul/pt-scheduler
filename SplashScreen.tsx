// Shown for the split second while a saved session is being restored,
// so the login page never flashes for someone who is already signed in.
export function SplashScreen() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-teal-700">
        <span className="h-10 w-10 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="font-display text-lg italic">Opening your rounds…</span>
      </div>
    </div>
  )
}
