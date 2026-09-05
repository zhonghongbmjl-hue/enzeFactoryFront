import type { AxiosInstance } from 'axios'
import { createApiRequest, http } from '../http'
import { createAfterSalesOperations } from './after-sales'
import { createExceptionCaseOperations } from './exception-cases'
import { createIdempotentPost } from './idempotent-post'
import { createShipmentOperations } from './shipments'

export function createShipmentApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  const post = createIdempotentPost(request)
  return {
    ...createShipmentOperations(request, post),
    ...createAfterSalesOperations(request, post),
    ...createExceptionCaseOperations(request, post),
  }
}

export const shipmentApi = createShipmentApi(http)
