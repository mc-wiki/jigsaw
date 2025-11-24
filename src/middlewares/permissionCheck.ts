import { createMiddleware } from 'hono/factory'
import { protectedFetch, Tokens } from '../oauth.js'
import { env } from 'hono/adapter'
import { getCookie, setCookie } from 'hono/cookie'
import { HTTPException } from 'hono/http-exception'

export interface Profile {
  sub: string
  username: string
  editcount: number
  confirmed_email: boolean
  blocked: boolean
  registered: boolean
  groups: string[]
  rights: string[]
}

export default function permissionCheck(allowedGroups: string[]) {
  return createMiddleware<{
    Variables: {
      profile: Profile
    }
  }>(async (c, next) => {
    const cookie = getCookie(c, 'jigsawTokens')
    if (!cookie) {
      throw new HTTPException(401, { message: 'missingToken' })
    }
    const tokens = JSON.parse(cookie) as Tokens

    const config = env<{
      OAUTH_CLIENT_ID: string
      OAUTH_CLIENT_SECRET: string
      WG_API_KEY: string
    }>(c)

    // check perms
    const profile = (await (
      await protectedFetch(
        'https://minecraft.wiki/rest.php/oauth2/resource/profile',
        tokens,
        config,
      )
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
    c.set('profile', profile)

    console.log(profile)

    if (!allowedGroups.some((group) => profile.groups.includes(group)) && !profile.blocked) {
      return c.json({ message: 'insufficientPermission' }, 403)
    }

    setCookie(c, 'jigsawTokens', JSON.stringify(tokens), {
      domain: '.minecraft.wiki',
      maxAge: 60 * 60 * 24 * 120,
      path: '/',
      sameSite: 'None',
      secure: true,
    })
    await next()
  })
}
