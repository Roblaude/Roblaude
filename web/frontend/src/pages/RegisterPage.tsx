import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export function RegisterPage() {
  const { register, loading, error } = useAuthStore()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    try {
      await register(email, password, name)
      navigate('/')
    } catch {
      // error dans le store
    }
  }

  return (
    <div className="min-h-svh bg-gray-950 flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-gray-900 rounded-2xl border border-gray-800 p-8 space-y-5"
      >
        <div className="text-center space-y-1">
          <span className="text-4xl">🤖</span>
          <h1 className="text-xl font-semibold text-white">Inscription</h1>
          <p className="text-sm text-gray-500">RobLaude</p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {[
          { label: 'Nom', value: name, setter: setName, type: 'text', auto: 'name' },
          { label: 'Email', value: email, setter: setEmail, type: 'email', auto: 'email' },
          { label: 'Mot de passe', value: password, setter: setPassword, type: 'password', auto: 'new-password' },
        ].map(({ label, value, setter, type, auto }) => (
          <label key={label} className="block space-y-1.5">
            <span className="text-sm text-gray-400">{label}</span>
            <input
              type={type}
              value={value}
              onChange={(e) => setter(e.target.value)}
              required
              autoComplete={auto}
              minLength={type === 'password' ? 8 : undefined}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5
                         text-white placeholder-gray-600 focus:outline-none focus:border-violet-500
                         text-sm transition-colors"
            />
          </label>
        ))}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-violet-600 hover:bg-violet-700 text-white font-medium py-2.5
                     rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Inscription…' : "S'inscrire"}
        </button>

        <p className="text-center text-sm text-gray-500">
          Déjà un compte ?{' '}
          <Link to="/login" className="text-violet-400 hover:text-violet-300 transition-colors">
            Se connecter
          </Link>
        </p>
      </form>
    </div>
  )
}
