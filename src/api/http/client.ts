import axios, { AxiosHeaders, type AxiosInstance } from 'axios'
import { ApiClientError, isApiResponse, toApiClientError, unwrapApiResponse } from './errors'

declare module 'axios' {
  interface AxiosRequestConfig {
    authSessionGeneration?: number
    /** 下载文件等非 JSON 接口可显式跳过统一响应结构校验。 */
    skipResponseEnvelope?: boolean
  }

  interface InternalAxiosRequestConfig {
    authSessionGeneration?: number
    skipResponseEnvelope?: boolean
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

const defaultBaseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'

function isLoginRequest(url?: string): boolean {
  if (!url) return false
  const path = url.split('?')[0]?.replace(/\/+$/, '')
  return path === '/auth/login' || path === `${defaultBaseUrl}/auth/login`
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
    (response) => {
      if (response.config.skipResponseEnvelope) return response
      if (!isApiResponse(response.data)) {
        throw new ApiClientError(
          '服务端响应格式不正确',
          'INVALID_RESPONSE',
          undefined,
          false,
          response.status,
        )
      }
      unwrapApiResponse(response.data, response.status)
      return response
    },
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
      return Promise.reject(toApiClientError(error))
    },
  )
  return client
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
