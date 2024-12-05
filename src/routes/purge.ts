import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'
import { protectedFetch, Tokens } from '../oauth.js'
import { env } from 'hono/adapter'
import { getConnInfo } from '@hono/node-server/conninfo'
import { getCookie, setCookie } from 'hono/cookie'

const app = new Hono()

const bodySchema = z.object({
  urls: z.string().url().array(),
})

app.post('/', zValidator('json', bodySchema), async (c) => {
  const { urls } = c.req.valid('json')

  const cookie = getCookie(c, 'jigsawTokens')
  if (!cookie) {
    return c.json({ message: 'noToken' }, 401)
  }
  const tokens = JSON.parse(cookie) as Tokens

  const config = env<{ OAUTH_CLIENT_ID: string; OAUTH_CLIENT_SECRET: string; WG_API_KEY: string }>(
    c,
  )

  // check perms
  const profile = (await (
    await protectedFetch('https://minecraft.wiki/rest.php/oauth2/resource/profile', tokens, config)
  ).json()) as {
    sub: string
    username: string
    editcount: number
    confirmed_email: boolean
    blocked: boolean
    registered: boolean
    groups: string[]
    rights: string[]
  }

  console.log(profile)

  const allowedGroups = [
    'cats',
    'directors',
    'global-interface-maintainer',
    'patrollers',
    'sysops',
    'staff',
  ]

  if (!allowedGroups.some((group) => profile.groups.includes(group))) {
    return c.json({ message: 'insufficientPermission' }, 403)
  }

  // batch url into groups of 30
  const groups = []
  for (let i = 0; i < urls.length; i += 30) {
    groups.push(urls.slice(i, i + 30))
  }

  for (const group of groups) {
    await fetch('https://api.weirdgloop.org/purgecache', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Api-Key ${config.WG_API_KEY}`,
        'User-Agent': `jigsaw (on behalf of User:${profile.username} from ${getConnInfo(c).remote.address})`,
      },
      body: JSON.stringify({
        site: 'minecraft.wiki',
        urls: group,
      }),
    })
  }

  setCookie(c, 'jigsawTokens', JSON.stringify(tokens), {
    domain: '.minecraft.wiki',
    maxAge: 60 * 60 * 24 * 120,
    path: '/',
    sameSite: 'None',
  })

  return c.json({
    message: 'done',
  })
})

export default app
