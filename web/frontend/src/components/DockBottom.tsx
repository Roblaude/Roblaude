import { useState } from 'react'
import { Terminal, GitBranch, List, ChevronDown, ChevronUp } from 'lucide-react'
import { useMappingStore } from '@/stores/mappingStore'

// Dock en bas d'ecran avec tabs : Logs / TF / Topics.
// Logs = placeholder (WS /ws/robots/:id/logs viendra en T3.5.12 SSH).

type Tab = 'logs' | 'tf' | 'topics'

export function DockBottom() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('tf')
  const tfFrames = useMappingStore((s) => s.tfFrames)
  const topics = useMappingStore((s) => s.topics)

  const tabBtn = (key: Tab, label: string, Icon: typeof Terminal) => (
    <button
      onClick={() => { setTab(key); setOpen(true) }}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-t ${
        tab === key && open
          ? 'bg-gray-900 text-white border-t border-x border-gray-800'
          : 'text-gray-400 hover:text-white'
      }`}
    >
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  )

  return (
    <div className="bg-gray-950 border-t border-gray-800 rounded-t-lg overflow-hidden">
      <div className="flex items-center justify-between px-2 pt-1">
        <div className="flex">
          {tabBtn('logs', 'Logs', Terminal)}
          {tabBtn('tf', 'TF tree', GitBranch)}
          {tabBtn('topics', 'Topics', List)}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-gray-500 hover:text-white p-1.5"
          aria-label={open ? 'Replier' : 'Deplier'}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
        </button>
      </div>

      {open && (
        <div className="bg-gray-900 border-t border-gray-800 p-3 max-h-64 overflow-auto font-mono text-xs">
          {tab === 'logs' && (
            <div className="text-gray-500">
              Logs ROS : disponibles via SSH (T3.5.12 — pas encore implemente).
            </div>
          )}

          {tab === 'tf' && (
            tfFrames && tfFrames.length > 0 ? (
              <ul className="space-y-0.5 text-gray-300">
                {tfFrames.map((f, i) => (
                  <li key={i}>
                    <span className="text-cyan-400">{f.parent}</span>
                    <span className="text-gray-600"> → </span>
                    <span className="text-green-400">{f.id}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500">Aucun TF recu (le robot publie sur /tf).</div>
            )
          )}

          {tab === 'topics' && (
            topics && topics.length > 0 ? (
              <ul className="space-y-0.5 text-gray-300">
                {topics.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-cyan-400 min-w-[180px]">{t.name}</span>
                    <span className="text-gray-500">{t.msgType}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-gray-500">
                Aucun topic recu (poll SSH actif si ROBOT_X_SSH_HOST configure).
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}
