import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { LRUCache } from 'lru-cache'
import * as nbt from 'prismarine-nbt'

const app = new Hono()

// Query Schema ------------------------------------------------------------------------------------

const RESOURCE_ID_REGEX = /[a-z0-9/_]+/g

const QUERY_STRUCTURE = z.object({
  id: z.string().regex(RESOURCE_ID_REGEX),
  variant: z.coerce.number().int().min(0).default(0),
})

type QueryStructure = z.infer<typeof QUERY_STRUCTURE>

// Data Fetching

const DATA_REPO_PATH = (id: string) =>
  `https://raw.githubusercontent.com/misode/mcmeta/refs/heads/data/data/minecraft/structure/${id}.nbt`

interface StructureResult {
  resolved: boolean
  data?: {
    blocks: Record<string, string>
    structure: string
  }
}

const UNRESOLVED_STRUCTURE = { resolved: false } as StructureResult

const RESOLVED_CACHE = new LRUCache<string, StructureResult, QueryStructure>({
  max: 2000,
  ttl: 3600_000,
  fetchMethod: (_key, _stale, { context }) => resolveStructure(context),
})

function nameProvider() {
  let count = 0
  return () => {
    let ch: number
    if (count < 26) ch = 65 + count
    else if (count < 52) ch = 97 + count - 26
    else ch = 0x4e00 + count - 52
    count++
    return String.fromCharCode(ch)
  }
}

async function resolveStructure(query: QueryStructure) {
  const dataSource = DATA_REPO_PATH(query.id)
  const res = await fetch(dataSource)
  if (res.status !== 200) return UNRESOLVED_STRUCTURE
  const buffer = Buffer.from(new Uint8Array(await res.arrayBuffer()))
  const parsedNBT = ((await nbt.parse(buffer)).parsed as nbt.Compound).value
  const nextAvailableName = nameProvider()
  const stateMapper: Record<string, string> = {}
  const indexMapper = new Map<number, string>()
  const size = parsedNBT['size'] as nbt.List<nbt.TagType.Int>
  const [x, y, z] = size.value.value
  let palette
  const palettes = parsedNBT['palettes']
  if (palettes && palettes.type === nbt.TagType.List) {
    const paletteList = (palettes as nbt.List<nbt.TagType.List>).value.value
    if (query.variant >= paletteList.length) return UNRESOLVED_STRUCTURE
    palette = paletteList[query.variant].value as Record<
      string,
      undefined | nbt.Tags[nbt.TagType]
    >[]
  } else {
    if (query.variant !== 0) return UNRESOLVED_STRUCTURE
    palette = (parsedNBT['palette'] as nbt.List<nbt.TagType.Compound>).value.value
  }
  palette.forEach((v, k) => {
    const name = (v['Name'] as nbt.String).value.split(':', 2)[1]
    if (name === 'air') {
      indexMapper.set(k, '+')
    } else if (name === 'structure_void') {
      indexMapper.set(k, '-')
    } else {
      const mappedChar = nextAvailableName()
      indexMapper.set(k, mappedChar)
      if (v['Properties']) {
        const properties = (v['Properties'] as nbt.Compound).value
        const propertiesString = Object.entries(properties)
          .map((k) => `${k[0]}=${(k[1] as nbt.String).value}`)
          .sort()
          .join(',')
        stateMapper[mappedChar] = `${name}[${propertiesString}]`
      } else {
        stateMapper[mappedChar] = name
      }
    }
  })
  const blocks = parsedNBT['blocks'] as nbt.List<nbt.TagType.Compound>
  const mappedStructure = Array(y)
    .fill([])
    .map(() =>
      Array(z)
        .fill([])
        .map(() => Array(x).fill('-') as string[]),
    )
  blocks.value.value.forEach((v) => {
    const [px, py, pz] = (v['pos'] as nbt.List<nbt.TagType.Int>).value.value
    const state = (v['state'] as nbt.Int).value
    mappedStructure[py][pz][px] = indexMapper.get(state)!
  })
  const structureStr = mappedStructure.map((zp) => zp.map((xp) => xp.join('')).join(',')).join(';')
  return {
    found: true,
    resolved: true,
    data: {
      blocks: stateMapper,
      structure: structureStr,
    },
  }
}

app.get('/', zValidator('query', QUERY_STRUCTURE), async (ctx) => {
  const query = ctx.req.valid('query')
  const resolved = await RESOLVED_CACHE.fetch(`${query.id}-${query.variant}`, { context: query })
  if (resolved && resolved.resolved) {
    return ctx.json(resolved, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    })
  } else {
    return ctx.json(resolved, 404)
  }
})

export default app
