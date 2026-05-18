import express from 'express'
import { errorHandler } from './middleware/errorHandler'
import { authGuard } from './middleware/auth'
import authRouter from './routes/auth'
import missionsRouter from './routes/missions'
import pointsRouter from './routes/points'
import robotsRouter from './routes/robots'

const app = express()

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

// error handler — doit etre en dernier
app.use(errorHandler)

export { app }
