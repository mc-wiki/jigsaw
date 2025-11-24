import { Hono } from 'hono'
import { env } from 'hono/adapter'
import originCheck from '../middlewares/originCheck.js'
import permissionCheck, { type Profile } from '../middlewares/permissionCheck.js'
import { zValidator } from '@hono/zod-validator'
import z from 'zod'

const app = new Hono<{ Variables: { profile: Profile } }>()

app.use(originCheck)
app.use(
  permissionCheck([
    'cats',
    'directors',
    'global-interface-maintainer',
    'patrollers',
    'sysops',
    'staff',
  ]),
)

app.get('/get/:uuid', async (c) => {
  const uuid = c.req.param('uuid')
  const config = env<{
    OAUTH_CLIENT_ID: string
    OAUTH_CLIENT_SECRET: string
    WG_API_KEY: string
  }>(c)
  const profile = c.get('profile')

  const request = await fetch(`https://api.weirdgloop.org/wiki/feedback/get?id=${uuid}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Api-Key ${config.WG_API_KEY}`,
      'User-Agent': `jigsaw (on behalf of User:${profile.username} from ${c.req.header('CF-Connecting-IP')})`,
    },
  })

  return c.json((await request.json()) as object)
})

const bodySchema = z.object({
  id: z.uuid(),
  blockingUser: z.string().min(1),
  notes: z.string().min(1),
})

app.post('/block', zValidator('json', bodySchema), async (c) => {
  const body = c.req.valid('json')
  const config = env<{
    OAUTH_CLIENT_ID: string
    OAUTH_CLIENT_SECRET: string
    WG_API_KEY: string
  }>(c)
  const profile = c.get('profile')

  const request = await fetch(`https://api.weirdgloop.org/wiki/feedback/block`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Api-Key ${config.WG_API_KEY}`,
      'User-Agent': `jigsaw (on behalf of User:${profile.username} from ${c.req.header('CF-Connecting-IP')})`,
    },
    body: JSON.stringify({
      id: body.id,
      blockingUser: body.blockingUser,
      blockingUserSource: 'jigsaw',
      notes: body.notes,
    }),
  })

  return c.json((await request.json()) as object)
})

export default app
