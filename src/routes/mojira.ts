import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'
import { JSONValue } from 'hono/utils/types'
import { z } from 'zod'

const app = new Hono()

const querySchema = z.object({
  search: z.string().min(1),
  version: z.string().min(1),
})

app.get('/', zValidator('query', querySchema), async (c) => {
  const { search, version } = c.req.valid('query')

  const jql = `
    project in (MC, MCPE)
    AND "Confirmation Status" != Unconfirmed
    AND (
      resolution IS EMPTY
      OR (
        resolution = Fixed
        AND (
          affectedVersion = "${version}"
          OR fixVersion = earliestUnreleasedVersion()
        )
      )
    )
    AND (summary ~ "${search}")
    ORDER BY
      resolution ASC,
      "Mojang Priority" ASC
  `
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')

  const req = await fetch(
    `https://bugs.mojang.com/rest/api/2/search?maxResults=20&fields=summary&jql=${encodeURIComponent(jql)}`,
    {
      headers: {
        'User-Agent': 'MCWJigsawProxy (+https://github.com/mc-wiki/jigsaw)',
      },
    },
  )

  return c.json((await req.json()) as JSONValue)
})

export default app
