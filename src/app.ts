import { createApp, createRouter, defineEventHandler } from 'h3'
import renderer from './routes/renderer'

export const app = createApp()

const router = createRouter()
app.use(router)

router.get(
  '/',
  defineEventHandler(() => {
    return { message: '🎉 Hello, World!' }
  }),
)

router.post('/renderer', renderer)
