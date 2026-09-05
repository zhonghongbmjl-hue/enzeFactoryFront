import { http, request } from '../http'
import { createProductionEvidenceApi } from './evidence'
import { createProductionApi } from './work-orders'

export { createProductionApi }

export const productionApi = createProductionApi(http)
export const productionEvidenceApi = createProductionEvidenceApi(request)
