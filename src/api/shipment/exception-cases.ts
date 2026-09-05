import type { ApiRequestClient } from '../http'
import type { IdempotentPost } from './idempotent-post'
import type {
  ExceptionCase,
  ExceptionCategory,
  OpenExceptionCaseInput,
  Page,
  ResolveExceptionCaseInput,
} from '@/types/shipment'

export function createExceptionCaseOperations(request: ApiRequestClient, post: IdempotentPost) {
  return {
    async listExceptionCases(input: {
      salesOrderId?: string
      category?: ExceptionCategory
      status?: 'OPEN' | 'RESOLVED'
      page: number
      size: number
    }): Promise<Page<ExceptionCase>> {
      return request.get<Page<ExceptionCase>>('/shipment/exception-cases', { params: input })
    },
    openExceptionCase(input: OpenExceptionCaseInput, key: string) {
      return post<ExceptionCase>('/shipment/exception-cases', input, key)
    },
    resolveExceptionCase(id: string, input: ResolveExceptionCaseInput, key: string) {
      return post<ExceptionCase>(`/shipment/exception-cases/${id}/resolve`, input, key)
    },
  }
}
