import axios, { AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'

declare module 'axios' {
  interface AxiosRequestConfig {
    authSessionGeneration?: number
  }

  interface InternalAxiosRequestConfig {
    authSessionGeneration?: number
  }
}

export interface AuthSessionSnapshot {
  token: string | null
  generation: number
}

export interface AuthRuntime {
  getSession: () => AuthSessionSnapshot
  onUnauthorized: (requestGeneration: number) => void
}

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

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function isLoginRequest(url?: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]?.replace(/\/+$/, '')
  return path === '/auth/login' || path === `${defaultBaseUrl}/auth/login`
}

function publicError(error: unknown): ApiClientError {
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

export function createHttpClient(runtime: AuthRuntime): AxiosInstance {
  const client = axios.create({
    baseURL: defaultBaseUrl,
    timeout: 15_000,
    headers: { Accept: 'application/json' },
  })
  client.interceptors.request.use((config) => {
    const session = runtime.getSession()
    if (session.token && !isLoginRequest(config.url)) {
      const headers = AxiosHeaders.from(config.headers)
      headers.set('Authorization', `Bearer ${session.token}`)
      config.headers = headers
      config.authSessionGeneration = session.generation
    }
    return config
  })
  client.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        const requestGeneration = error.config?.authSessionGeneration
        const currentSession = runtime.getSession()
        if (
          typeof requestGeneration === 'number' &&
          currentSession.token &&
          currentSession.generation === requestGeneration
        ) {
          runtime.onUnauthorized(requestGeneration)
        }
      }
      return Promise.reject(publicError(error))
    },
  )
  return client
}

export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`
}

export interface IdempotencyAttempt {
  keyFor(payload: unknown): string
  succeeded(): void
  failed(error: unknown): boolean
}

export function createIdempotencyAttempt(): IdempotencyAttempt {
  let fingerprint: string | undefined
  let key: string | undefined
  return {
    keyFor(payload: unknown): string {
      const next = JSON.stringify(payload)
      if (!key || fingerprint !== next) {
        fingerprint = next
        key = createIdempotencyKey()
      }
      return key
    },
    succeeded(): void {
      fingerprint = undefined
      key = undefined
    },
    failed(error: unknown): boolean {
      const deterministic = isDeterministicBusinessRejection(error)
      if (deterministic) {
        fingerprint = undefined
        key = undefined
      }
      return deterministic
    },
  }
}

function isUncertainCode(code?: string): boolean {
  return code === 'IDEMPOTENCY_IN_PROGRESS' || code === 'CACHE_UNAVAILABLE'
}

function isDeterministicBusinessRejection(error: unknown): boolean {
  if (!(error instanceof ApiClientError) || error.outcomeUnknown || isUncertainCode(error.code)) {
    return false
  }
  return (
    error.httpStatus !== undefined &&
    error.httpStatus >= 400 &&
    error.httpStatus < 500 &&
    error.httpStatus !== 408
  )
}

export function withIdempotency<T extends AxiosRequestConfig>(
  config: T,
  key = createIdempotencyKey(),
): T {
  const method = config.method?.toLowerCase()
  if (!method || !['post', 'put', 'patch', 'delete'].includes(method)) return config
  return {
    ...config,
    headers: { ...config.headers, 'Idempotency-Key': key },
  }
}

let configuredRuntime: AuthRuntime = {
  getSession: () => ({ token: null, generation: 0 }),
  onUnauthorized: () => undefined,
}

export function configureAuthRuntime(runtime: AuthRuntime): void {
  configuredRuntime = runtime
}

export const http = createHttpClient({
  getSession: () => configuredRuntime.getSession(),
  onUnauthorized: (requestGeneration) => configuredRuntime.onUnauthorized(requestGeneration),
})
