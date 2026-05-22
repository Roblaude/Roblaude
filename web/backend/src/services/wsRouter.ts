import type { Server as HttpServer, IncomingMessage } from 'node:http'
import type { Duplex } from 'node:stream'
import jwt from 'jsonwebtoken'
import { getJwtSecret } from '../middleware/auth'

// Factorise l'upgrade WS pour les multiples paths (a venir : /ws, /ws/robots/:id/telemetry, /tf, /topics, /logs, /ssh).
// Auth JWT centralisee. Chaque path s'enregistre via register(pattern, handler).
// Pattern simple : '/ws' (exact) ou '/ws/robots/:id/telemetry' (params nommes).
//
// Le `wsRelay` global et les futurs relays appellent `wsRouter.register(...)`
// pour s'enregistrer comme handler de leur path.

type HandlerCtx = {
  req: IncomingMessage
  socket: Duplex
  head: Buffer
  params: Record<string, string>
  token: string
  decodedToken: jwt.JwtPayload | string
}
export type WsPathHandler = (ctx: HandlerCtx) => void

interface Route {
  regex: RegExp
  paramNames: string[]
  handler: WsPathHandler
  requireAuth: boolean
}

class WsRouter {
  private routes: Route[] = []
  private attached = false

  /** Enregistre un handler pour un pattern. Ordre = priorite (premier match gagne). */
  register(pattern: string, handler: WsPathHandler, opts: { requireAuth?: boolean } = {}): void {
    const paramNames: string[] = []
    const regexStr = pattern.replace(/:([a-zA-Z_]+)/g, (_, name) => {
      paramNames.push(name)
      return '([^/]+)'
    })
    this.routes.push({
      regex: new RegExp('^' + regexStr + '$'),
      paramNames,
      handler,
      requireAuth: opts.requireAuth ?? true,
    })
  }

  /** Attache le router sur le HTTP server — un seul listener 'upgrade'. */
  attach(server: HttpServer): void {
    if (this.attached) return
    this.attached = true
    server.on('upgrade', (req, socket, head) => {
      if (!req.url) return socket.destroy()
      const url = new URL(req.url, `http://${req.headers.host}`)
      const route = this.routes.find((r) => r.regex.test(url.pathname))

      if (!route) {
        socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
        socket.destroy()
        return
      }

      let decoded: jwt.JwtPayload | string = ''
      const token = url.searchParams.get('token') ?? ''

      if (route.requireAuth) {
        if (!token) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
        try {
          decoded = jwt.verify(token, getJwtSecret())
        } catch {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
          socket.destroy()
          return
        }
      }

      // Extrait params nommes (:id, etc.)
      const match = url.pathname.match(route.regex)!
      const params: Record<string, string> = {}
      route.paramNames.forEach((n, i) => { params[n] = match[i + 1] })

      route.handler({ req, socket, head, params, token, decodedToken: decoded })
    })
  }
}

export const wsRouter = new WsRouter()
