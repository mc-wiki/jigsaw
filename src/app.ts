import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { prettyJSON } from 'hono/pretty-json'

import renderer from './routes/renderer.js'
import mojira from './routes/mojira.js'
import { createMiddleware } from 'hono/factory'

const app = new Hono()

app.use(prettyJSON())

app.use(async (c, next) => {
  const { SERVER } = env<{ SERVER: string }>(c)
  c.res.headers.set('Server', `${SERVER ?? 'Unknown'} (Hono)`)
  await next()
})

app.use(
  createMiddleware<{ Variables: { vary: string[] } }>(async (c, next) => {
    const origin = c.req.header('Origin')
    c.set('vary', ['Origin'])

    if (origin) {
      const { hostname } = new URL(origin)
      if (hostname === 'minecraft.wiki' || hostname.endsWith('.minecraft.wiki'))
        c.res.headers.set('Access-Control-Allow-Origin', origin)
    }
    await next()

    c.res.headers.set('Vary', c.get('vary').join(', '))
  }),
)

app.get('/', (c) => c.json({ message: '🎉 Hello, World!' }))

app.route('/renderer', renderer)
app.route('/mojira', mojira)

export default app
