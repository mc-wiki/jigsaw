import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { env } from 'hono/adapter'
import { setCookie } from 'hono/cookie'
import { z } from 'zod'

const app = new Hono()

const querySchema = z.object({
  code: z.string().min(1),
})

app.get('/callback', zValidator('query', querySchema), async (c) => {
  const { code } = c.req.valid('query')
  const { OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET } = env<{
    OAUTH_CLIENT_ID: string
    OAUTH_CLIENT_SECRET: string
  }>(c)

  const request = await fetch('https://minecraft.wiki/rest.php/oauth2/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
    }),
  })

  const token = (await request.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at: number
  }

  setCookie(
    c,
    'jigsawTokens',
    JSON.stringify({
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: Date.now() + token.expires_in * 1000,
    }),
    {
      domain: '.minecraft.wiki',
      maxAge: 60 * 60 * 24 * 120,
      path: '/',
      sameSite: 'None',
      secure: true,
    },
  )

  return c.html('<script>window.close()</script>')
})

export default app
