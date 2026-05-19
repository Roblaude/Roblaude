import { useAuthStore } from "@/stores/authStore"

const API_BASE = "/api"

/**
 * Wrapper fetch qui ajoute automatiquement le header Authorization: Bearer <token>
 * et gère les 401 (logout + redirect /login).
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = useAuthStore.getState().token

  const headers = new Headers(init.headers)
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers })

  if (res.status === 401) {
    useAuthStore.getState().logout()
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login"
    }
  }

  return res
}
