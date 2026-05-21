import 'dotenv/config'
import { app } from './app'
import { robotMqtt } from './services/mqtt'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

robotMqtt.connect()

function shutdown(signal: string) {
  console.log(`[server] ${signal} recu, arret propre…`)
  robotMqtt.disconnect()
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
