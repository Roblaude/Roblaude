import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/errorHandler'
import { authGuard } from './middleware/auth'
import authRouter from './routes/auth'
import missionsRouter from './routes/missions'
import pointsRouter from './routes/points'
import robotsRouter from './routes/robots'
import mappingRouter from './routes/mapping'

const app = express()

// CORS — le frontend (Vite, port 5173) et le backend (3001) sont sur des
// origines differentes : sans CORS le navigateur bloque les requetes.
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
}))

app.use(express.json())

// Health check (public)
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Auth routes (public)
app.use('/api/auth', authRouter)

// Routes protegees par authGuard
app.use('/api/missions', authGuard, missionsRouter)
app.use('/api/points', authGuard, pointsRouter)
app.use('/api/robots', authGuard, robotsRouter)
app.use('/api/mapping', authGuard, mappingRouter)

// error handler — doit etre en dernier
app.use(errorHandler)

export { app }
