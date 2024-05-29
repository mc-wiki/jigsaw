import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const app = new Hono()

app.use(async (c, next) => {
  c.res.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
  await next()
})

const querySchema = z.object({
  jql: z.string().min(1),
})

app.get('/', zValidator('query', querySchema), async (c) => {
  const { jql } = c.req.valid('query')

  const req = await fetch(
    `https://bugs.mojang.com/rest/api/2/search?maxResults=10&fields=summary&jql=${encodeURIComponent(jql)}`,
    {
      headers: {
        'User-Agent': 'minecraft.wiki API Proxy (dianliang233 at gmail.com)',
      },
    },
  )

  return c.json((await req.json()) as object)
})

export default app
