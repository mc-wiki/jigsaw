import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

import _blockStateData from '../data/renderer/block_states.json' with { type: 'json' }
import _blockModelData from '../data/renderer/block_models.json' with { type: 'json' }
import _textureAtlasData from '../data/renderer/atlas.json' with { type: 'json' }
import _blockRenderTypeData from '../data/renderer/block_render_type.json' with { type: 'json' }
import _blockOcclusionShapeData from '../data/renderer/block_occlusion_shape.json' with { type: 'json' }
import _specialBlocksData from '../data/renderer/special.json' with { type: 'json' }
import _liquidComputationData from '../data/renderer/block_liquid_computation.json' with { type: 'json' }
import { LRUCache } from 'lru-cache'

const blockStateData = _blockStateData as unknown as Record<string, BlockStateModelCollection>
const blockModelData = _blockModelData as unknown as Record<string, BlockModel>
const textureAtlasData = _textureAtlasData as unknown as Record<string, AnimatedTexture | number[]>
const blockRenderTypeData = _blockRenderTypeData as unknown as Record<string, string>
const blockOcclusionShapeData = _blockOcclusionShapeData as unknown as Record<
  string,
  OcclusionFaceData
>
const specialBlocksData = _specialBlocksData as unknown as Record<string, number[]>
const liquidComputationData = _liquidComputationData as unknown as Record<
  string,
  LiquidComputationData
>

const app = new Hono()

// Query Schema ------------------------------------------------------------------------------------

const BlockState = z.object({
  name: z.string(),
  properties: z.record(z.string()).optional(),
})
type BlockState = z.infer<typeof BlockState>

const querySchema = z.object({
  states: z.array(BlockState),
  hash: z.string(),
})

// Data Definitions --------------------------------------------------------------------------------

interface BlockStateModelCollection {
  variants?: Record<string, ModelReference | ModelReferenceWithWeight[]>
  multipart?: ConditionalPart[]
}

interface ModelReference {
  model: number
  uvlock?: boolean
  x?: number
  y?: number
}

interface ModelReferenceWithWeight {
  model: number
  uvlock?: boolean
  x?: number
  y?: number
  weight?: number
}

interface ConditionalPart {
  apply: ModelReference | ModelReferenceWithWeight[]
  when?: Record<string, string> | AndCondition | OrCondition
}

interface AndCondition {
  AND: (Record<string, string> | AndCondition | OrCondition)[]
}

interface OrCondition {
  OR: (Record<string, string> | AndCondition | OrCondition)[]
}

interface OcclusionFaceData {
  down?: number[][]
  up?: number[][]
  north?: number[][]
  south?: number[][]
  west?: number[][]
  east?: number[][]
  can_occlude: boolean
}

interface LiquidComputationData {
  blocks_motion: boolean
  face_sturdy: string[]
}

interface BlockModel {
  elements?: ModelElement[]
}

interface ModelElement {
  from: number[]
  to: number[]
  rotation?: never
  shade?: boolean
  faces: {
    down?: ModelFace
    up?: ModelFace
    north?: ModelFace
    south?: ModelFace
    west?: ModelFace
    east?: ModelFace
  }
}

interface ModelFace {
  texture: number
  uv?: number[]
  rotation?: number
  tintindex?: number
  cullface?: string
}

interface AnimatedTexture {
  frames: number[]
  time: number[]
  interpolate?: boolean
}

// Model Selection Algorithm -----------------------------------------------------------------------

function conditionMatch(
  condition: Record<string, string> | AndCondition | OrCondition,
  blockProperties: Record<string, string>,
): boolean {
  if ('AND' in condition) {
    return (condition as AndCondition).AND.every(
      (part: Record<string, string> | AndCondition | OrCondition) =>
        conditionMatch(part, blockProperties),
    )
  } else if ('OR' in condition) {
    return (condition as OrCondition).OR.some(
      (part: Record<string, string> | AndCondition | OrCondition) =>
        conditionMatch(part, blockProperties),
    )
  } else {
    return Object.entries(condition).every(([key, value]) => {
      const reversed = value.startsWith('!')
      if (reversed) value = value.slice(1)
      return value.split('|').includes(blockProperties[key]) !== reversed
    })
  }
}

function chooseModel(
  blockState: BlockState,
): (ModelReference | ModelReferenceWithWeight[])[] | null {
  const modelCollection = blockStateData[blockState.name]

  if (!modelCollection) return null
  if (!modelCollection.variants && !modelCollection.multipart) return null

  const blockProperties = blockState.properties ?? {}
  if (modelCollection.variants) {
    for (const [key, value] of Object.entries(modelCollection.variants)) {
      const stateCondition = key.split(',')
      let match = true
      for (const condition of stateCondition) {
        const [key, value] = condition.split('=')
        if (blockProperties[key] !== value) {
          match = false
          break
        }
      }
      if (match) return [value]
    }
  } else {
    const matchingPart = modelCollection.multipart!.filter((part) =>
      conditionMatch(part.when ?? {}, blockProperties),
    )
    if (matchingPart.length === 0) return null
    return matchingPart.map((part) => part.apply)
  }

  return null
}

// Response Scheme ---------------------------------------------------------------------------------

interface StateData {
  parts: (ModelReference | ModelReferenceWithWeight[])[]
  models: number[]
  textures: number[]
  render_type: string
  face_sturdy: string[]
  blocks_motion: boolean
  occlusion: boolean
  occlusion_shape: Record<string, number[][]>
  special_textures: number[]
}

interface Response {
  processed: boolean
}

interface NotProcessedResponse extends Response {
  processed: false
}

const NOT_PROCESSED_RESPONSE: NotProcessedResponse = { processed: false }

interface ProcessedResponse extends Response {
  states: {
    state: BlockState
    parts: (ModelReference | ModelReferenceWithWeight[])[]
    render_type: string
    face_sturdy: string[]
    blocks_motion: boolean
    occlusion: boolean
    occlusion_shape: Record<string, number[][]>
    special_textures: number[]
  }[]
  models: Record<string, BlockModel>
  textures: Record<string, AnimatedTexture | number[]>
  processed: true
}

function stateToString(blockState: BlockState): string {
  if (blockState.properties && Object.keys(blockState.properties).length > 0) {
    return `${blockState.name}[${Object.entries(blockState.properties)
      .sort(([key1], [key2]) => key1.localeCompare(key2))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')}]`
  } else {
    return blockState.name
  }
}

function stateToStringFilteredWaterLogged(blockState: BlockState): string {
  const filtered = Object.entries(blockState.properties ?? {}).filter(
    ([key]) => key !== 'waterlogged',
  )
  if (filtered.length > 0) {
    return `${blockState.name}[${filtered
      .sort(([key1], [key2]) => key1.localeCompare(key2))
      .map(([key, value]) => `${key}=${value}`)
      .join(',')}]`
  } else {
    return blockState.name
  }
}

// Cache -------------------------------------------------------------------------------------------

const EMPTY_STATE_DATA: StateData = {
  parts: [],
  models: [],
  textures: [],
  render_type: 'solid',
  face_sturdy: [],
  blocks_motion: false,
  occlusion: false,
  occlusion_shape: {},
  special_textures: [],
}

const BLOCK_CACHE = new LRUCache<string, StateData, BlockState>({
  max: 2000,
  memoMethod: (_key, _staleValue, options) => makeStateData(options.context),
})

function findOrMakeData(blockState: BlockState): StateData {
  return BLOCK_CACHE.memo(stateToString(blockState), { context: blockState })
}

function makeStateData(blockState: BlockState): StateData {
  const stateString = stateToStringFilteredWaterLogged(blockState)
  const stateName = blockState.name

  const parts = chooseModel(blockState)
  const specials = specialBlocksData[stateName]
  const occlusionShape = blockOcclusionShapeData[stateString] ?? { can_occlude: false }
  const liquidComputation = liquidComputationData[stateString] ?? {
    blocks_motion: false,
    face_sturdy: [],
  }

  if (!parts && !specials && !occlusionShape.can_occlude && !liquidComputation.blocks_motion)
    return EMPTY_STATE_DATA

  const models = new Set<number>()
  if (parts) {
    for (const part of parts) {
      if (Array.isArray(part)) {
        for (const model of part) {
          models.add(model.model)
        }
      } else {
        models.add(part.model)
      }
    }
  }

  const textures = new Set<number>()
  specials?.forEach((val) => textures.add(val))
  for (const model of models) {
    const modelData = blockModelData[String(model)]
    if (modelData) {
      for (const element of modelData.elements ?? []) {
        for (const face of Object.values(element.faces)) {
          textures.add(face.texture)
        }
      }
    }
  }

  const texturesParsed = new Set<number>()
  for (const texture of textures) {
    const textureData = textureAtlasData[String(texture)]
    if (Array.isArray(textureData)) {
      texturesParsed.add(texture)
    } else {
      texturesParsed.add(texture)
      textureData.frames.forEach((val) => texturesParsed.add(val))
    }
  }

  return {
    parts: parts ?? [],
    models: Array.from(models),
    textures: Array.from(texturesParsed),
    render_type: blockRenderTypeData[stateName] ?? 'solid',
    face_sturdy: liquidComputation.face_sturdy,
    blocks_motion: liquidComputation.blocks_motion,
    occlusion: occlusionShape.can_occlude,
    occlusion_shape: {
      down: occlusionShape.down ?? [],
      up: occlusionShape.up ?? [],
      north: occlusionShape.north ?? [],
      south: occlusionShape.south ?? [],
      west: occlusionShape.west ?? [],
      east: occlusionShape.east ?? [],
    },
    special_textures: specials ?? [],
  }
}

const RESOLVED_CACHE = new LRUCache<string, ProcessedResponse>({
  max: 1000,
})

// Routes ------------------------------------------------------------------------------------------

app.get('/', (ctx) => {
  const hash = ctx.req.query('key')
  if (!hash) return ctx.json({ error: 'No key provided' }, 400)
  const response = RESOLVED_CACHE.get(hash)
  if (response)
    return ctx.json(response, 200, {
      'Cache-Control': 'public, max-age=86400, s-maxage=604800',
    })
  return ctx.json(NOT_PROCESSED_RESPONSE, 404)
})

app.post('/process', zValidator('json', querySchema), (ctx) => {
  const query = ctx.req.valid('json')
  const response = { states: [], textures: {}, models: {}, processed: true } as ProcessedResponse
  const collectedTextures = new Set<string>()
  const collectedModels = new Set<string>()

  for (const blockState of query.states) {
    const data = findOrMakeData(blockState)
    response.states.push({
      state: blockState,
      parts: data.parts,
      render_type: data.render_type,
      face_sturdy: data.face_sturdy,
      blocks_motion: data.blocks_motion,
      occlusion: data.occlusion,
      occlusion_shape: data.occlusion_shape,
      special_textures: data.special_textures,
    })
    data.textures.forEach((texture) => collectedTextures.add(String(texture)))
    data.special_textures.forEach((texture) => collectedTextures.add(String(texture)))
    data.models.forEach((model) => collectedModels.add(String(model)))
  }

  collectedTextures.forEach((tex) => (response.textures[tex] = textureAtlasData[tex]))
  collectedModels.forEach((model) => (response.models[model] = blockModelData[model]))
  RESOLVED_CACHE.set(query.hash, response)

  return ctx.json(response)
})

export default app
