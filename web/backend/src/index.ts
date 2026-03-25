import express from 'express'
import { errorHandler } from './middleware/errorHandler'
import missionsRouter from './routes/missions'

const app = express()
const PORT = process.env.PORT || 3001

app.use(express.json())

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

app.use('/api/missions', missionsRouter)
// app.use('/api/points', pointsRouter)
// app.use('/api/robots', robotsRouter)

// error handler — doit être en dernier
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})
