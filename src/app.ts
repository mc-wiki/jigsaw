import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { prettyJSON } from 'hono/pretty-json'
import { cors } from 'hono/cors'

import renderer from './routes/renderer.js'
import mojira from './routes/mojira.js'
import oauth from './routes/oauth.js'
import purge from './routes/purge.js'

const app = new Hono()

app.use(prettyJSON())

app.use(async (c, next) => {
  const { SERVER } = env<{ SERVER: string }>(c)
  c.res.headers.set('Server', `${SERVER ?? 'Unknown'} (Hono)`)
  await next()
})

app.use(
  cors({
    origin: '*',
  }),
)

app.get('/', (c) => c.json({ message: '🎉 Hello, World!' }))

app.route('/renderer', renderer)
app.route('/mojira', mojira)
app.route('/oauth', oauth)
app.route('/purge', purge)

export default app
