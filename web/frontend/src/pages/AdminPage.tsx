import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '@/lib/api'

interface Point {
  id: number
  name: string
  slug: string
  x: number
  y: number
  theta: number
  description?: string | null
  _count?: { objects: number }
}

interface PointForm {
  id: number | null
  name: string
  slug: string
  x: string
  y: string
  theta: string
  description: string
}

const EMPTY_FORM: PointForm = {
  id: null,
  name: '',
  slug: '',
  x: '0',
  y: '0',
  theta: '0',
  description: '',
}

// Transforme un nom libre en slug valide ([a-z0-9-]+).
function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function AdminPage() {
  const [points, setPoints] = useState<Point[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<PointForm>(EMPTY_FORM)
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isEditing = form.id !== null

  async function loadPoints() {
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/points')
      if (!res.ok) throw new Error('Erreur chargement des points')
      const json = (await res.json()) as { data: Point[] }
      setPoints(json.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPoints()
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
    setSlugTouched(false)
  }

  function editPoint(p: Point) {
    setForm({
      id: p.id,
      name: p.name,
      slug: p.slug,
      x: String(p.x),
      y: String(p.y),
      theta: String(p.theta),
      description: p.description ?? '',
    })
    setSlugTouched(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      x: Number(form.x),
      y: Number(form.y),
      theta: Number(form.theta),
      description: form.description.trim() || undefined,
    }

    if (!payload.name || !payload.slug) {
      setError('Le nom et le slug sont requis')
      return
    }
    if (!/^[a-z0-9-]+$/.test(payload.slug)) {
      setError('Le slug ne doit contenir que des minuscules, chiffres et tirets')
      return
    }
    if (Number.isNaN(payload.x) || Number.isNaN(payload.y) || Number.isNaN(payload.theta)) {
      setError('Les coordonnees x, y, theta doivent etre des nombres')
      return
    }

    setSubmitting(true)
    try {
      const res = isEditing
        ? await apiFetch(`/points/${form.id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
          })
        : await apiFetch('/points', {
            method: 'POST',
            body: JSON.stringify(payload),
          })
      if (!res.ok) {
        const err = (await res.json()) as { error: string }
        throw new Error(err.error)
      }
      resetForm()
      await loadPoints()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Echec de l'enregistrement")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(p: Point) {
    if (!window.confirm(`Supprimer le point « ${p.name} » ?`)) return
    setError(null)
    try {
      const res = await apiFetch(`/points/${p.id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const err = (await res.json()) as { error: string }
        throw new Error(err.error)
      }
      if (form.id === p.id) resetForm()
      await loadPoints()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Echec de la suppression')
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg ' +
    'px-3 py-2 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-1">Administration</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gestion des points nommes du batiment (utilises comme destinations de mission).
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
        >
          {error}
        </div>
      )}

      {/* Formulaire creation / edition */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5"
      >
        <h2 className="text-sm font-semibold text-white mb-4">
          {isEditing ? `Modifier le point #${form.id}` : 'Nouveau point'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-name" className="text-sm font-medium text-gray-300">
              Nom
            </label>
            <input
              id="p-name"
              type="text"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value
                setForm((f) => ({
                  ...f,
                  name,
                  slug: slugTouched ? f.slug : slugify(name),
                }))
              }}
              className={inputClass}
              placeholder="Accueil"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-slug" className="text-sm font-medium text-gray-300">
              Slug
            </label>
            <input
              id="p-slug"
              type="text"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true)
                setForm((f) => ({ ...f, slug: e.target.value }))
              }}
              className={`${inputClass} font-mono`}
              placeholder="accueil"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-x" className="text-sm font-medium text-gray-300">
              X (metres)
            </label>
            <input
              id="p-x"
              type="number"
              step="0.01"
              value={form.x}
              onChange={(e) => setForm((f) => ({ ...f, x: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-y" className="text-sm font-medium text-gray-300">
              Y (metres)
            </label>
            <input
              id="p-y"
              type="number"
              step="0.01"
              value={form.y}
              onChange={(e) => setForm((f) => ({ ...f, y: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="p-theta" className="text-sm font-medium text-gray-300">
              Theta (radians)
            </label>
            <input
              id="p-theta"
              type="number"
              step="0.01"
              value={form.theta}
              onChange={(e) => setForm((f) => ({ ...f, theta: e.target.value }))}
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="p-desc" className="text-sm font-medium text-gray-300">
              Description <span className="text-gray-500">(optionnel)</span>
            </label>
            <input
              id="p-desc"
              type="text"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className={inputClass}
              placeholder="Hall d'entree principal"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting
              ? 'Enregistrement…'
              : isEditing
                ? 'Enregistrer les modifications'
                : 'Creer le point'}
          </button>
          {isEditing && (
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 text-sm
                         rounded-lg hover:bg-gray-700 transition-colors"
            >
              Annuler
            </button>
          )}
        </div>
      </form>

      {/* Table des points */}
      <h2 className="text-sm font-semibold text-white mb-3">
        Points enregistres {!loading && `(${points.length})`}
      </h2>
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              {['Nom', 'Slug', 'X', 'Y', 'Theta', 'Actions'].map((h) => (
                <th
                  key={h}
                  className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="bg-gray-950">
                  <td colSpan={6} className="px-4 py-3">
                    <div className="h-4 bg-gray-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : points.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                  Aucun point enregistre
                </td>
              </tr>
            ) : (
              points.map((p) => (
                <tr key={p.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-gray-200">{p.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-400">{p.slug}</td>
                  <td className="px-4 py-3 text-gray-300">{p.x}</td>
                  <td className="px-4 py-3 text-gray-300">{p.y}</td>
                  <td className="px-4 py-3 text-gray-300">{p.theta}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => editPoint(p)}
                        className="px-2.5 py-1 text-xs bg-gray-800 border border-gray-700
                                   text-gray-300 rounded hover:bg-gray-700 transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        className="px-2.5 py-1 text-xs bg-red-500/10 border border-red-500/20
                                   text-red-400 rounded hover:bg-red-500/20 transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
