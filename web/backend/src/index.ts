import 'dotenv/config'
import http from 'node:http'
import { app } from './app'
import { robotMqtt } from './services/mqtt'
import { wsRouter } from './services/wsRouter'
import { wsRelay } from './services/websocket'

const PORT = process.env.PORT || 3001

// HTTP server explicite (createServer) pour pouvoir attacher le WS dessus
// (upgrade handshake). app.listen ne donne pas acces au server.
const server = http.createServer(app)
// wsRouter prend la main sur l'event 'upgrade' (un seul listener).
// wsRelay s'enregistre comme handler du path /ws via wsRouter.
wsRouter.attach(server)
wsRelay.register()

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

robotMqtt.connect()

function shutdown(signal: string) {
  console.log(`[server] ${signal} recu, arret propre…`)
  robotMqtt.disconnect()
  wsRelay.close()
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
