import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const app = new Hono()

app.use(async (c, next) => {
  c.res.headers.set('Cache-Control', 'public, max-age=86400, s-maxage=604800')
  await next()
})

const querySchema = z.object({
  project: z.string().min(1),
  jql: z.string().min(1),
})

app.get('/', zValidator('query', querySchema), async (c) => {
  const { project, jql } = c.req.valid('query')

  const req = await fetch('https://bugs.mojang.com/api/jql-search-post', {
    method: 'POST',
    headers: {
      'User-Agent': 'minecraft.wiki API Proxy (dianliang233 at gmail.com)',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      advanced: true,
      search: jql,
      project: project,
      startAt: 0,
      maxResults: 10,
    }),
  })

  return c.json((await req.json()) as object)
})

export default app
