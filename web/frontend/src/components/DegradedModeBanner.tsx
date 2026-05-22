import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'

// Banner global qui apparait si /api/health ne repond pas pendant 10s.
// Utilise un fetch direct (pas apiFetch — on veut detecter meme sans token).

const POLL_MS = 5000
const FAIL_THRESHOLD = 2 // 2 echecs consecutifs = on affiche

export function DegradedModeBanner() {
  const [failCount, setFailCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    const check = async (): Promise<void> => {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 3000)
        const res = await fetch('/api/health', { signal: ctrl.signal })
        clearTimeout(t)
        if (cancelled) return
        if (res.ok) setFailCount(0)
        else setFailCount((c) => c + 1)
      } catch {
        if (!cancelled) setFailCount((c) => c + 1)
      }
    }
    void check()
    const id = setInterval(check, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [])

  if (failCount < FAIL_THRESHOLD) return null

  return (
    <div className="fixed top-0 inset-x-0 z-50 bg-red-700 text-white text-sm px-4 py-2 flex items-center gap-2 shadow-lg">
      <AlertTriangle className="w-4 h-4 shrink-0" />
      <span>Backend hors-ligne — les actions seront indisponibles. Reconnexion auto…</span>
    </div>
  )
}
