import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import { Terminal, Wifi, WifiOff } from 'lucide-react'
import 'xterm/css/xterm.css'
import { useAuthStore } from '@/stores/authStore'

// Terminal interactif SSH (xterm.js + WS /ws/robots/:id/ssh).
// Reserve aux ADMIN — l'auth est checkee cote backend a l'upgrade.

interface Props {
  robotId: number
}

export function SshTerminal({ robotId }: Props) {
  const token = useAuthStore((s) => s.token)
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!containerRef.current || !token) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      theme: { background: '#0a0a0a', foreground: '#e5e7eb', cursor: '#22d3ee' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.write('Connexion SSH au robot…\r\n')

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${proto}//${window.location.host}/ws/robots/${robotId}/ssh?token=${encodeURIComponent(token)}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = (): void => {
      setConnected(true)
      term.write('\r\n\x1b[32m[connecte]\x1b[0m\r\n')
      // envoyer la taille initiale
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }
    ws.onclose = (): void => {
      setConnected(false)
      term.write('\r\n\x1b[31m[deconnecte]\x1b[0m\r\n')
    }
    ws.onerror = (): void => {
      term.write('\r\n\x1b[31m[erreur connexion]\x1b[0m\r\n')
    }
    ws.onmessage = (e): void => {
      if (typeof e.data === 'string') term.write(e.data)
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }))
      }
    })

    const onResize = (): void => {
      if (!fitRef.current || !termRef.current || !wsRef.current) return
      fitRef.current.fit()
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          cols: termRef.current.cols,
          rows: termRef.current.rows,
        }))
      }
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      ws.close()
      term.dispose()
      termRef.current = null
      wsRef.current = null
    }
  }, [robotId, token])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Terminal SSH</h2>
        </div>
        {connected ? (
          <span className="flex items-center gap-1.5 text-green-400 text-xs">
            <Wifi className="w-3 h-3" /> connecte
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-gray-500 text-xs">
            <WifiOff className="w-3 h-3" /> deconnecte
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="bg-black border border-gray-900 rounded p-2"
        style={{ height: 400 }}
      />
      <div className="text-xs text-gray-600 mt-2">
        Shell ELEVATED — audit log a l'ouverture. ADMIN role requis.
      </div>
    </div>
  )
}
