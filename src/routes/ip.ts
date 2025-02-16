import Cloudflare from 'cloudflare'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import originCheck from '../middlewares/originCheck.js'

const app = new Hono<{
  Variables: {
    cloudflare: Cloudflare
  }
  Bindings: { CLOUDFLARE_API_KEY: string }
}>()

app.use(originCheck)

app.use(async (c, next) => {
  c.set(
    'cloudflare',
    new Cloudflare({
      apiToken: env(c).CLOUDFLARE_API_KEY,
    }),
  )
  await next()
})

app.get('/:ip', async (c) => {
  const ip = c.req.param('ip')

  const cf = c.get('cloudflare')
  const responses = await Promise.all([
    cf.radar.entities.get({ ip }),
    cf.radar.entities.asns.ip({ ip }),
  ])

  const botClass = (
    await cf.radar.http.summary.botClass({ asn: [responses[0].ip.asn], dateRange: ['26w'] })
  ).summary_0

  return c.json({ ...responses.reduce((acc, res) => ({ ...acc, ...res }), {}), botClass })
})

export default app
