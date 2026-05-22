import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Terminal, RefreshCw, FileText, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { useRobotStore } from '../stores/robotStore'
import { fetchSshAudit, fetchRobotLogs, execSsh, type SshAuditEntry } from '../lib/sshApi'

// Page admin /admin/ssh. Affiche :
// - les derniers audits SSH (qui a lance quoi quand)
// - un viewer journalctl (poll manuel via bouton refresh)
// - une console allowlist (input + bouton exec)

const SUGGESTED_CMDS = [
  'uptime',
  'free -h',
  'df -h',
  'ros2 topic list',
  'ros2 node list',
  'docker ps',
]

export function AdminSshPage() {
  const robotId = useRobotStore((s) => s.id)
  const [audit, setAudit] = useState<SshAuditEntry[]>([])
  const [logs, setLogs] = useState<string>('')
  const [unit, setUnit] = useState('')
  const [cmd, setCmd] = useState('')
  const [output, setOutput] = useState<string>('')
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [running, setRunning] = useState(false)

  const refreshAudit = async (): Promise<void> => {
    setLoadingAudit(true)
    try {
      setAudit(await fetchSshAudit(robotId, 30))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'erreur audit')
    } finally {
      setLoadingAudit(false)
    }
  }
  const refreshLogs = async (): Promise<void> => {
    setLoadingLogs(true)
    try {
      const r = await fetchRobotLogs(robotId, { unit: unit || undefined, lines: 200 })
      setLogs(r.stdout || '(aucune ligne)')
    } catch (e) {
      setLogs(`erreur: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setLoadingLogs(false)
    }
  }
  const runCmd = async (c: string): Promise<void> => {
    setRunning(true)
    setOutput('')
    try {
      const r = await execSsh(robotId, c)
      setOutput(`$ ${c}\n${r.stdout}${r.stderr ? `\n--stderr--\n${r.stderr}` : ''}\n(exit ${r.code})`)
      void refreshAudit()
    } catch (e) {
      setOutput(`erreur: ${e instanceof Error ? e.message : 'unknown'}`)
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    void refreshAudit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotId])

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-gray-400 hover:text-white">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-white">SSH admin</h1>
            <p className="text-sm text-gray-500 mt-0.5">Allowlist + audit + journalctl</p>
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-yellow-400 text-xs">
          <Shield className="w-4 h-4" /> admin uniquement
        </span>
      </div>

      {/* Console allowlist */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-4 h-4 text-gray-400" />
          <h2 className="text-sm font-medium text-gray-300">Console (commandes allowlist)</h2>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {SUGGESTED_CMDS.map((s) => (
            <button
              key={s}
              onClick={() => setCmd(s)}
              className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded border border-gray-700"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && cmd && !running) void runCmd(cmd) }}
            placeholder="ros2 topic list"
            className="flex-1 bg-black border border-gray-700 rounded px-3 py-1.5 text-sm text-white font-mono"
          />
          <button
            onClick={() => void runCmd(cmd)}
            disabled={!cmd || running}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded text-sm"
          >
            Exec
          </button>
        </div>
        {output && (
          <pre className="bg-black border border-gray-900 rounded p-3 text-xs text-gray-200 overflow-auto max-h-64 font-mono whitespace-pre-wrap">
            {output}
          </pre>
        )}
      </div>

      {/* Logs */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-400" />
            <h2 className="text-sm font-medium text-gray-300">journalctl</h2>
          </div>
          <div className="flex gap-2">
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="unit (optionnel, ex: roblaude.service)"
              className="bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white font-mono w-64"
            />
            <button
              onClick={refreshLogs}
              disabled={loadingLogs}
              className="text-xs flex items-center gap-1 px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded"
            >
              <RefreshCw className={`w-3 h-3 ${loadingLogs ? 'animate-spin' : ''}`} /> recharger
            </button>
          </div>
        </div>
        <pre className="bg-black border border-gray-900 rounded p-3 text-xs text-gray-300 overflow-auto max-h-96 font-mono whitespace-pre">
          {logs || '(clique recharger)'}
        </pre>
      </div>

      {/* Audit log */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-300">Historique audit SSH</h2>
          <button
            onClick={refreshAudit}
            disabled={loadingAudit}
            className="text-gray-500 hover:text-white"
          >
            <RefreshCw className={`w-4 h-4 ${loadingAudit ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="overflow-auto max-h-80">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-1.5 px-2">Date</th>
                <th className="text-left py-1.5 px-2">User</th>
                <th className="text-left py-1.5 px-2">Mode</th>
                <th className="text-left py-1.5 px-2">Commande</th>
                <th className="text-right py-1.5 px-2">Exit</th>
                <th className="text-right py-1.5 px-2">ms</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id} className="border-b border-gray-900 text-gray-300">
                  <td className="py-1 px-2">{new Date(a.createdAt).toLocaleString('fr-FR')}</td>
                  <td className="py-1 px-2">{a.user?.name ?? a.userId}</td>
                  <td className="py-1 px-2">{a.mode}</td>
                  <td className="py-1 px-2 font-mono">{a.command}</td>
                  <td className={`py-1 px-2 text-right ${a.exitCode === 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {a.exitCode ?? '—'}
                  </td>
                  <td className="py-1 px-2 text-right text-gray-500">{a.durationMs ?? '—'}</td>
                </tr>
              ))}
              {audit.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-500 py-4">Aucun audit log.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
