export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

export async function protectedFetch(
  url: string | URL,
  tokens: Tokens,
  env: { OAUTH_CLIENT_ID: string; OAUTH_CLIENT_SECRET: string },
  init?: RequestInit,
  forceRefresh = false,
): Promise<Response> {
  if (Date.now() > tokens.expiresAt || forceRefresh) {
    const newTokens = await refreshTokens(tokens, env)
    tokens.accessToken = newTokens.accessToken
    tokens.refreshToken = newTokens.refreshToken
    tokens.expiresAt = newTokens.expiresAt
  }

  try {
    return await fetch(url, {
      ...init,
      headers: {
        ...init?.headers,
        Authorization: `Bearer ${tokens.accessToken}`,
      },
    })
  } catch (e) {
    if (e instanceof Error && e.message === 'Unauthorized') {
      return protectedFetch(url, tokens, env, init, true)
    } else {
      throw e
    }
  }
}

export async function refreshTokens(
  tokens: Tokens,
  env: {
    OAUTH_CLIENT_ID: string
    OAUTH_CLIENT_SECRET: string
  },
): Promise<Tokens> {
  const newTokens = (await (
    await fetch('https://minecraft.wiki/rest.php/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
        client_id: env.OAUTH_CLIENT_ID,
        client_secret: env.OAUTH_CLIENT_SECRET,
      }),
    })
  ).json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
    expires_at: number
  }

  return {
    accessToken: newTokens.access_token,
    refreshToken: newTokens.refresh_token,
    expiresAt: Date.now() + newTokens.expires_in * 1000,
  }
}
