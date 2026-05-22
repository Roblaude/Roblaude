import { WebSocketServer, WebSocket, type RawData } from 'ws'
import { wsRouter } from './wsRouter'
import { getSshClient } from './sshConnection'
import prisma from '../lib/prisma'

// WS /ws/robots/:id/ssh — shell interactif via ssh2.requestShell.
// Reservation : ADMIN role uniquement. Audit log a l'ouverture.
// Frame protocole : { type:'input', data:'...' } client -> server | { type:'resize', cols, rows }
//                   string base64 server -> client (stdout/stderr du shell)

interface ClientFrame {
  type?: 'input' | 'resize'
  data?: string
  cols?: number
  rows?: number
}

class WsSsh {
  private wss: WebSocketServer | null = null

  register(): void {
    if (this.wss) return
    this.wss = new WebSocketServer({ noServer: true })

    wsRouter.register('/ws/robots/:id/ssh', async ({ req, socket, head, params, decodedToken }) => {
      const robotId = Number(params.id)
      if (!Number.isInteger(robotId) || robotId <= 0) {
        socket.destroy()
        return
      }
      const userId = typeof decodedToken === 'object' && decodedToken !== null
        ? (decodedToken as { userId?: number }).userId
        : undefined
      if (!userId) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n')
        socket.destroy()
        return
      }
      // verifier role ADMIN
      try {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
        if (!user || user.role !== 'ADMIN') {
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n')
          socket.destroy()
          return
        }
      } catch {
        socket.destroy()
        return
      }

      this.wss!.handleUpgrade(req, socket, head, async (ws) => {
        await this.attachShell(robotId, userId, ws)
      })
    })

    console.log('[ws] wsSsh registered on /ws/robots/:id/ssh')
  }

  private async attachShell(robotId: number, userId: number, ws: WebSocket): Promise<void> {
    // audit ouverture
    await prisma.sshAuditLog.create({
      data: { robotId, userId, mode: 'ELEVATED', command: '[shell open]', exitCode: null, durationMs: null },
    }).catch(() => {})

    let stream: import('ssh2').ClientChannel | null = null
    try {
      const ssh = await getSshClient(robotId)
      // ssh2 NodeSSH expose .connection (Client ssh2). On utilise requestShell direct.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conn = (ssh as any).connection as import('ssh2').Client | null
      if (!conn) {
        ws.send('[wsSsh] connexion SSH indisponible\r\n')
        ws.close()
        return
      }
      stream = await new Promise<import('ssh2').ClientChannel>((resolve, reject) => {
        conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, s) => {
          if (err || !s) reject(err ?? new Error('shell error'))
          else resolve(s)
        })
      })
    } catch (err) {
      ws.send(`[wsSsh] echec : ${err instanceof Error ? err.message : 'unknown'}\r\n`)
      ws.close()
      return
    }

    stream.on('data', (d: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d.toString('utf8'))
    })
    stream.stderr.on('data', (d: Buffer) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d.toString('utf8'))
    })
    stream.on('close', () => ws.close())

    ws.on('message', (raw: RawData) => {
      let frame: ClientFrame
      try { frame = JSON.parse(raw.toString()) } catch { return }
      if (frame.type === 'input' && typeof frame.data === 'string') {
        stream!.write(frame.data)
      } else if (frame.type === 'resize' && Number.isInteger(frame.cols) && Number.isInteger(frame.rows)) {
        stream!.setWindow(frame.rows!, frame.cols!, 0, 0)
      }
    })
    ws.on('close', () => { stream?.end() })
    ws.on('error', () => { stream?.end() })
  }

  close(): void {
    this.wss?.close()
    this.wss = null
  }
}

export const wsSsh = new WsSsh()
