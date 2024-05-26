import { z } from 'zod'
import { defineEventHandler, readValidatedBody } from 'h3'
import blockStateData from '../data/renderer/block_states.json'
import blockModelData from '../data/renderer/block_models.json'
import textureAtlasData from '../data/renderer/atlas.json'
import blockRenderTypeData from '../data/renderer/block_render_type.json'
import blockOcclusionShapeData from '../data/renderer/block_occlusion_shape.json'
import specialBlocksData from '../data/renderer/special.json'
import liquidComputationData from '../data/renderer/block_liquid_computation.json'

const bodySchema = z.object({
  definitions: z.record(z.string()),
})

// Block Model Structure

export interface BlockModel {
  elements?: ModelElement[]
}

export interface ModelElement {
  from: number[]
  to: number[]
  rotation?: ModelRotation
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

export interface ModelFace {
  texture: number
  uv?: number[]
  rotation?: number
  tintindex?: number
  cullface?: string
}

// Block State Structure

export interface ModelRotation {
  origin: number[]
  axis: 'x' | 'y' | 'z' | string
  angle: number
  rescale?: boolean
}

export interface BlockStateModelCollection {
  variants?: Record<string, ModelReference | ModelReferenceWithWeight[]>
  multipart?: ConditionalPart[]
}

export interface ModelReference {
  model: number
  uvlock?: boolean
  x?: number
  y?: number
}

export interface ModelReferenceWithWeight {
  model: number
  uvlock?: boolean
  x?: number
  y?: number
  weight?: number
}

export interface ConditionalPart {
  apply: ModelReference | ModelReferenceWithWeight[]
  when?: Record<string, unknown> | AndCondition | OrCondition
}

export interface AndCondition {
  AND: (Record<string, unknown> | AndCondition | OrCondition)[]
}

export interface OrCondition {
  OR: (Record<string, unknown> | AndCondition | OrCondition)[]
}

// Block Texture Structure

export interface AnimatedTexture {
  frames: number[]
  time: number[]
  interpolate?: boolean
}

// Occlusion Face Structure

export interface OcclusionFaceData {
  down?: number[][]
  up?: number[][]
  north?: number[][]
  south?: number[][]
  west?: number[][]
  east?: number[][]
  can_occlude: boolean
}

// Liquid Computation Data

export interface LiquidComputationData {
  blocks_motion: boolean
  face_sturdy: string[]
}

const handler = defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, (data: unknown) => bodySchema.parse(data))

  const foundBlocks: string[] = []
  const foundBlockRenderType: Record<string, string> = {}
  const foundBlockStates: Record<string, BlockStateModelCollection> = {}
  const foundBlockModel: Record<string, BlockModel> = {}
  const foundTextureAtlas: Record<string, AnimatedTexture | number[]> = {}
  const foundOcclusionShape: Record<string, string | null> = {}
  const foundSpecialBlocksData: Record<string, number[]> = {}
  const foundLiquidComputationData: Record<string, LiquidComputationData> = {}

  for (const [k, v] of Object.entries(body.definitions)) {
    const modelKey = new Set<string>()
    const atlasKey = new Set<string>()
    // Split tint data
    const tintDataSplitPoint = v.indexOf('!')
    let tint: string | null = null
    let unresolvedBlockState: string

    if (tintDataSplitPoint !== -1) {
      tint = v.substring(tintDataSplitPoint + 1)
      unresolvedBlockState = v.substring(0, tintDataSplitPoint - 1)
    } else {
      unresolvedBlockState = v
    }

    // Sort block properties
    const splitPoint = unresolvedBlockState.indexOf('[')
    let block: string
    let state
    let nonWaterLoggedState
    if (splitPoint !== -1) {
      block = unresolvedBlockState.substring(0, splitPoint - 1)
      const stateList = unresolvedBlockState.substring(splitPoint + 1, -2).split(',')
      const unsortedStateMap: Record<string, string> = {}
      const stateNameList: string[] = []
      for (const state of stateList) {
        const splitNamePoint = state.indexOf('=')
        const stateName = state.substring(0, splitNamePoint - 1)
        const stateValue = state.substring(splitNamePoint + 1)
        unsortedStateMap[stateName] = stateValue
        stateNameList.push(stateName)
      }
      stateNameList.sort()
      const sortedStateList: string[] = []
      const sortedStateListNonWaterLogged: string[] = []
      for (const stateName of stateNameList) {
        sortedStateList.push(stateName + '=' + unsortedStateMap[stateName])
        if (stateName === 'waterlogged')
          sortedStateListNonWaterLogged.push(stateName + '=' + unsortedStateMap[stateName])
        else {
          foundSpecialBlocksData['water'] = specialBlocksData['water']
          specialBlocksData.water.forEach((texture) => atlasKey.add(texture.toString()))
        }
      }
      state = '[' + sortedStateList.join(',') + ']'
      nonWaterLoggedState = '[' + sortedStateListNonWaterLogged.join(',') + ']'
    } else {
      if (
        unresolvedBlockState == 'seagrass' ||
        unresolvedBlockState == 'kelp' ||
        unresolvedBlockState == 'bubble_column'
      ) {
        foundSpecialBlocksData['water'] = specialBlocksData['water']
        specialBlocksData.water.forEach((texture) => atlasKey.add(texture.toString()))
      }
      block = unresolvedBlockState
      state = ''
      nonWaterLoggedState = ''
    }

    const resolvedBlockState = tint !== null ? block + state + '!' + tint : block + state

    foundBlocks.push(k + '=' + resolvedBlockState)

    if (keyInObject(block, blockRenderTypeData)) {
      foundBlockRenderType[block] = blockRenderTypeData[block]
    }

    if (keyInObject(block, specialBlocksData)) {
      foundSpecialBlocksData[block] = specialBlocksData[block]
    }

    if (keyInObject(block, blockStateData)) {
      foundBlockStates[block] = blockStateData[block]
    }

    getModelForBlock(foundBlockStates[block]).forEach((value) => modelKey.add(value))

    for (const key of modelKey) {
      if (keyInObject(key, blockModelData)) {
        foundBlockModel[key] = blockModelData[key]
        const blockModel: BlockModel = blockModelData[key]
        if (!blockModel.elements) continue

        for (const element of blockModel.elements) {
          for (const face of Object.values(element.faces)) {
            atlasKey.add(face.texture.toString())
          }
        }
      }
    }

    for (const key of atlasKey) {
      if (keyInObject(key, textureAtlasData)) {
        foundTextureAtlas[key] = textureAtlasData[key]

        const atlasData: AnimatedTexture | number[] = textureAtlasData[key]

        if (!(atlasData instanceof Array)) {
          for (const frame of atlasData.frames) {
            atlasKey.add(frame.toString())
          }
        }
      }
    }

    const searchKey = block + nonWaterLoggedState

    if (keyInObject(searchKey, blockOcclusionShapeData)) {
      foundOcclusionShape[k] = blockOcclusionShapeData[searchKey]
    }

    if (keyInObject(block, liquidComputationData)) {
      foundLiquidComputationData[k] = liquidComputationData[block]
    }
  }

  return {
    blockStates: foundBlockStates,
    blockModel: foundBlockModel,
    textureAtlas: foundTextureAtlas,
    blockRenderType: foundBlockRenderType,
    occlusionShape: foundOcclusionShape,
    specialBlocksData: foundSpecialBlocksData,
    liquidComputationData: foundLiquidComputationData,
  }
})

export default handler

function keyInObject<T extends object>(
  key: string | number | symbol,
  obj: T,
): key is keyof typeof obj {
  return key in obj
}

function getModelForBlock(blockState?: BlockStateModelCollection) {
  if (blockState === undefined) return new Set<string>()
  const modelKey = new Set<string>()
  if (blockState.multipart) {
    for (const part of blockState.multipart) {
      if (part.apply instanceof Array) {
        for (const apply of part.apply) {
          modelKey.add(apply.model.toString())
        }
      } else modelKey.add(part.apply.model.toString())
    }
  }
  if (blockState.variants) {
    for (const model of Object.values(blockState.variants)) {
      if (model instanceof Array) {
        for (const m of model) {
          modelKey.add(m.model.toString())
        }
      } else modelKey.add(model.model.toString())
    }
  }

  return modelKey
}
