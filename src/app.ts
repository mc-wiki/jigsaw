import { createApp, createRouter, defineEventHandler } from 'h3'

export const app = createApp()

const router = createRouter()
app.use(router)

router.get(
  '/',
  defineEventHandler((event) => {
    return { message: '🎉 Hello, World!' }
  }),
)

router.post(
  '/blockStructureRenderer',
  defineEventHandler((event) => {
    return { message: '⚡️ Tadaa!' }
  }),
)
