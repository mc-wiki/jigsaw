import { cors } from 'hono/cors'

export default cors({
  origin: (o, c) => {
    const origin = c.req.query('origin') ?? o

    return origin.startsWith('https://') && origin.endsWith('.minecraft.wiki')
      ? origin
      : 'https://minecraft.wiki'
  },
  credentials: true,
})
