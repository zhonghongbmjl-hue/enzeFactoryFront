import axios from 'axios'
import type { ApiResponse } from '@/types/api'

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code = 'CLIENT_ERROR',
    readonly traceId?: string,
    readonly outcomeUnknown = false,
    readonly httpStatus?: number,
  ) {
    super(message)
    this.name = 'ApiClientError'
  }
}

interface ErrorEnvelope {
  message?: string
  code?: string
  traceId?: string
}

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ApiResponse<unknown>>
  return (
    typeof candidate.success === 'boolean' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    'data' in candidate &&
    typeof candidate.traceId === 'string' &&
    typeof candidate.timestamp === 'string'
  )
}

export function unwrapApiResponse<T>(payload: ApiResponse<T>, httpStatus?: number): T {
  if (!payload.success) {
    throw new ApiClientError(
      payload.message || '请求处理失败',
      payload.code || 'BUSINESS_ERROR',
      payload.traceId,
      false,
      httpStatus,
    )
  }
  return payload.data
}

export function isUncertainCode(code?: string): boolean {
  return code === 'IDEMPOTENCY_IN_PROGRESS' || code === 'CACHE_UNAVAILABLE'
}

export function toApiClientError(error: unknown): ApiClientError {
  if (axios.isAxiosError<ErrorEnvelope>(error)) {
    const payload = error.response?.data
    const code = payload?.code || 'REQUEST_FAILED'
    const status = error.response?.status
    return new ApiClientError(
      payload?.message || '系统暂时无法响应，请稍后重试',
      code,
      payload?.traceId,
      !error.response || (status !== undefined && status >= 500) || isUncertainCode(code),
      status,
    )
  }
  if (error instanceof ApiClientError) return error
  return new ApiClientError('系统暂时无法响应，请稍后重试')
}
