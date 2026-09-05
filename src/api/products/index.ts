import { http } from '../http'
import { createBomApi } from './bom'
import { createProductApi } from './product'

export { createBomApi, createProductApi }

export const productApi = createProductApi(http)
export const bomApi = createBomApi(http)
