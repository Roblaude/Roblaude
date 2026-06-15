import { useEffect, useState, type FormEvent } from 'react'
import { apiFetch } from '@/lib/api'
import { listObjects, createObject, updateObject, deleteObject, type GraspObject } from '@/lib/objectsApi'

interface PointLite {
  id: number
  name: string
}

interface ObjectForm {
  id: number | null
  name: string
  imageUrl: string
  available: boolean
  locationId: string
}

const EMPTY_FORM: ObjectForm = { id: null, name: '', imageUrl: '', available: true, locationId: '' }

export function AdminObjectsPage() {
  const [objects, setObjects] = useState<GraspObject[]>([])
  const [points, setPoints] = useState<PointLite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<ObjectForm>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const isEditing = form.id !== null

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [objs, pRes] = await Promise.all([listObjects(), apiFetch('/points')])
      setObjects(objs)
      if (pRes.ok) {
        const j = (await pRes.json()) as { data: PointLite[] }
        setPoints(j.data)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function resetForm() {
    setForm(EMPTY_FORM)
  }

  function editObject(o: GraspObject) {
    setForm({
      id: o.id,
      name: o.name,
      imageUrl: o.imageUrl ?? '',
      available: o.available,
      locationId: String(o.locationId),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setError('Le nom est requis')
      return
    }
    if (form.locationId === '') {
      setError('Choisis un emplacement')
      return
    }

    const payload = {
      name: form.name.trim(),
      imageUrl: form.imageUrl.trim() || undefined,
      available: form.available,
      locationId: Number(form.locationId),
    }

    setSubmitting(true)
    try {
      if (isEditing) await updateObject(form.id!, payload)
      else await createObject(payload)
      resetForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Echec de l'enregistrement")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(o: GraspObject) {
    if (!window.confirm(`Supprimer l'objet « ${o.name} » ?`)) return
    setError(null)
    try {
      await deleteObject(o.id)
      if (form.id === o.id) resetForm()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Echec de la suppression')
    }
  }

  const inputClass =
    'w-full bg-gray-800 border border-gray-700 text-gray-200 text-sm rounded-lg ' +
    'px-3 py-2 focus:outline-none focus:border-violet-500'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-semibold text-white mb-1">Objets saisissables</h1>
      <p className="text-sm text-gray-500 mb-6">
        Gestion des objets que le robot peut récupérer (missions pick &amp; place).
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mb-8 rounded-xl border border-gray-800 bg-gray-900/50 p-5">
        <h2 className="text-sm font-semibold text-white mb-4">
          {isEditing ? `Modifier l'objet #${form.id}` : 'Nouvel objet'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="o-name" className="text-sm font-medium text-gray-300">Nom</label>
            <input
              id="o-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={inputClass}
              placeholder="Dossier patient"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="o-location" className="text-sm font-medium text-gray-300">Emplacement</label>
            <select
              id="o-location"
              value={form.locationId}
              onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
              disabled={loading}
              className={inputClass}
            >
              <option value="">— Choisir un point —</option>
              {points.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="o-image" className="text-sm font-medium text-gray-300">
              Image URL <span className="text-gray-500">(optionnel)</span>
            </label>
            <input
              id="o-image"
              type="text"
              value={form.imageUrl}
              onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
              className={inputClass}
              placeholder="https://…"
            />
          </div>

          <div className="flex items-center gap-2 sm:col-span-2">
            <input
              id="o-available"
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
              className="size-4 accent-violet-600"
            />
            <label htmlFor="o-available" className="text-sm text-gray-300">Disponible</label>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm
                       font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? 'Enregistrement…' : isEditing ? 'Enregistrer les modifications' : 'Creer l\'objet'}
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

      <h2 className="text-sm font-semibold text-white mb-3">
        Objets enregistrés {!loading && `(${objects.length})`}
      </h2>
      <div className="rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-900 border-b border-gray-800">
            <tr>
              {['Nom', 'Emplacement', 'Disponible', 'Actions'].map((h) => (
                <th key={h} className="text-left text-xs text-gray-500 font-medium uppercase tracking-wider px-4 py-3">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="bg-gray-950">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="h-4 bg-gray-800 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : objects.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-gray-500">Aucun objet enregistré</td>
              </tr>
            ) : (
              objects.map((o) => (
                <tr key={o.id} className="bg-gray-950 hover:bg-gray-900 transition-colors">
                  <td className="px-4 py-3 text-gray-200">{o.name}</td>
                  <td className="px-4 py-3 text-gray-400">{o.location?.name ?? `#${o.locationId}`}</td>
                  <td className="px-4 py-3">
                    {o.available ? (
                      <span className="text-emerald-400">Oui</span>
                    ) : (
                      <span className="text-gray-500">Non</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => editObject(o)}
                        className="px-2.5 py-1 text-xs bg-gray-800 border border-gray-700 text-gray-300 rounded hover:bg-gray-700 transition-colors"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(o)}
                        className="px-2.5 py-1 text-xs bg-red-500/10 border border-red-500/20 text-red-400 rounded hover:bg-red-500/20 transition-colors"
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
