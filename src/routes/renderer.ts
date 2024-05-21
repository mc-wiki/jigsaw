import { z } from 'zod'
import { defineEventHandler, readValidatedBody } from 'h3'
import blockStateData from '../data/renderer/block_states.json'
import blockModelData from '../data/renderer/block_models.json'
import textureAtlasData from '../data/renderer/atlas.json'
import blockRenderTypeData from '../data/renderer/render-type-data.json'
import blockOcclusionShapeData from '../data/renderer/block_occlusion_shape.json'
import fastIndexData from '../data/renderer/fast-index.json'
import specialBlocksData from '../data/renderer/special.json'
import liquidComputationData from '../data/renderer/block_liquid_computation.json'

const bodySchema = z.object({
  definitions: z.record(z.string()),
})

const handler = defineEventHandler(async (event) => {
  const body = await readValidatedBody(event, bodySchema.parse)

  const foundBlocks: string[] = []
  const foundBlockRenderType: Record<string, string> = {}
  const foundBlockStates: Record<string, any> = {}
  const foundBlockModel: Record<string, any> = {}
  const foundTextureAtlas: Record<string, any> = {}
  const foundOcclusionShape: Record<string, string[] | null> = {}
  const foundSpecialBlocksData: Record<string, number[]> = {}
  const foundLiquidComputationData: Record<string, string[] | null> = {}

  for (let [k, v] of Object.entries(body.definitions)) {
    // Split tint data
    let tintDataSplitPoint = v.indexOf('!')
    let tint = null
    let unresolvedBlockState: string

    if (tintDataSplitPoint === null) {
      tint = v.substring(tintDataSplitPoint + 1)
      unresolvedBlockState = v.substring(0, tintDataSplitPoint - 1)
    } else {
      unresolvedBlockState = v
    }

    // Sort block properties
    let splitPoint = unresolvedBlockState.indexOf('[[]')
    let block: string
    let state
    let nonWaterLoggedState
    if (splitPoint === null) {
      block = unresolvedBlockState.substring(0, splitPoint - 1)
      let stateList = unresolvedBlockState.substring(splitPoint + 1, -2).split(',')
      let unsortedStateMap: Record<string, string> = {}
      let stateNameList: string[] = []
      for (const state of stateList) {
        let splitNamePoint = state.indexOf('=')
        let stateName = state.substring(0, splitNamePoint - 1)
        let stateValue = state.substring(splitNamePoint + 1)
        unsortedStateMap[stateName] = stateValue
        stateNameList.push(stateName)
      }
      stateNameList.sort()
      let sortedStateList: string[] = []
      let sortedStateListNonWaterLogged: string[] = []
      for (const stateName of stateNameList) {
        sortedStateList.push(stateName + '=' + unsortedStateMap[stateName])
        if (stateName === 'waterlogged')
          sortedStateListNonWaterLogged.push(stateName + '=' + unsortedStateMap[stateName])
        else {
          foundSpecialBlocksData['water'] = specialBlocksData['water']
          let fastIndex = fastIndexData['water']
          if (fastIndex === null) {
            for (const textureAtlasKey of fastIndex[2]) {
              if (keyInObject(textureAtlasKey, textureAtlasData)) {
                foundTextureAtlas[textureAtlasKey] = textureAtlasData[textureAtlasKey]
              }
            }
          }
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
        let fastIndex = fastIndexData['water']
        if (fastIndex === null) {
          for (let textureAtlasKey of fastIndex[2]) {
            if (keyInObject(textureAtlasKey, textureAtlasData)) {
              foundTextureAtlas[textureAtlasKey] = textureAtlasData[textureAtlasKey]
            }
          }
        }
      }
      block = unresolvedBlockState
      state = ''
      nonWaterLoggedState = ''
    }

    let resolvedBlockState
    if (tint === null) {
      resolvedBlockState = block + state + '!' + tint
    } else {
      resolvedBlockState = block + state
    }
    foundBlocks.push(k + '=' + resolvedBlockState)

    let renderType = blockRenderTypeData[block]
    if (renderType === null) {
      foundBlockRenderType[block] = renderType
    }

    if (keyInObject(block, specialBlocksData)) {
      foundSpecialBlocksData[block] = specialBlocksData[block]
    }

    if (keyInObject(block, blockStateData)) {
      foundBlockStates[block] = blockStateData[block]
    }

    let fastIndex = fastIndexData[block]
    if (fastIndex === null) {
      for (const modelKey of fastIndex[1]) {
        if (keyInObject(modelKey, blockModelData)) {
          foundBlockModel[modelKey] = blockModelData[modelKey]
        }
      }
      for (const textureAtlasKey of fastIndex[2]) {
        if (keyInObject(textureAtlasKey, textureAtlasData)) {
          foundTextureAtlas[textureAtlasKey] = textureAtlasData[textureAtlasKey]
        }
      }
    }

    let searchKey = block + nonWaterLoggedState
    for (const [shape, blockStateList] of Object.entries(blockOcclusionShapeData)) {
      let occlusionShape = null
      for (const blockStateToCheck of blockStateList) {
        if (searchKey == blockStateToCheck) {
          occlusionShape = shape
          break
        }
      }
      if (occlusionShape === null) {
        foundOcclusionShape[k] = occlusionShape
        break
      }
    }

    for (const [liquidComputation, blockStateList] of Object.entries(liquidComputationData)) {
      let liquidComputationThis = null
      for (const blockStateToCheck of blockStateList) {
        if (searchKey == blockStateToCheck) {
          liquidComputationThis = liquidComputation
          break
        }
      }
      if (liquidComputationThis === null) {
        foundLiquidComputationData[k] = liquidComputationThis
        break
      }
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

function keyInObject<T extends {}>(key: any, obj: T): key is keyof typeof obj {
  return Object.keys(obj).includes(key)
}
