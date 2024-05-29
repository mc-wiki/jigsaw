import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { z } from 'zod'

const app = new Hono()

const querySchema = z.object({
  search: z.string().min(1),
  version: z.string().min(1),
})

app.get('/', zValidator('query', querySchema), async (c) => {
  const { search, version } = c.req.valid('query')

  const jqls = [
    `
    project = MC
    AND "Confirmation Status" != Unconfirmed
    AND (
      resolution IS EMPTY
      OR (
        resolution = Fixed
        AND affectedVersion = "${version}"
      )
    )
    AND ${search}
    ORDER BY
      resolution ASC,
      "Mojang Priority" ASC,
      votes DESC,
      key ASC
    `,
    `
    project = MCPE
    AND "Confirmation Status" != Unconfirmed
    AND resolution IS EMPTY
    AND ${search}
    ORDER BY
      resolution ASC,
      votes DESC,
      key ASC
    `,
  ].map((s) => s.trim().replace(/\n/g, ' ').replace(/\s+/g, ' '))

  const req = await Promise.all(
    jqls.map((jql) =>
      fetch(
        `https://bugs.mojang.com/rest/api/2/search?maxResults=10&fields=summary&jql=${encodeURIComponent(jql)}`,
        {
          headers: {
            'User-Agent': 'MCWJigsawProxy (+https://github.com/mc-wiki/jigsaw)',
          },
        },
      ),
    ),
  )

  return c.json({
    java: await req[0].json(),
    bedrock: await req[1].json(),
  })
})

export default app
