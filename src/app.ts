import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { prettyJSON } from 'hono/pretty-json'

import renderer from './routes/renderer.js'

const app = new Hono()

app.use(prettyJSON())
app.use(async (c, next) => {
  const { SERVER } = env<{ SERVER: string }>(c)
  c.res.headers.set('Server', `${SERVER ?? 'Unknown'} (Hono)`)
  await next()
})

app.get('/', (c) => c.json({ message: '🎉 Hello, World!' }))
app.route('/renderer', renderer)

export default app
