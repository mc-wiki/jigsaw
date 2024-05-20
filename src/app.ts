import { createApp, createRouter, defineEventHandler } from 'h3'

export const app = createApp()

const router = createRouter()
app.use(router)

router.post(
  '/blockStructureRenderer',
  defineEventHandler((event) => {
    return { message: '⚡️ Tadaa!' }
  }),
)
