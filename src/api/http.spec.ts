import { describe, expect, it, vi } from 'vitest'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import {
  ApiClientError,
  createHttpClient,
  createIdempotencyAttempt,
  createIdempotencyKey,
  withIdempotency,
} from './http'

declare module 'axios' {
  interface AxiosRequestConfig {
    authSessionGeneration?: number
  }

  interface InternalAxiosRequestConfig {
    authSessionGeneration?: number
  }
}

const successAdapter = async (config: AxiosRequestConfig) => ({
  data: {},
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})

describe('HTTP authentication boundary', () => {
  it('injects Authorization into protected API requests', async () => {
    const client = createHttpClient({
      getSession: () => ({ token: 'signed.jwt', generation: 3 }),
      onUnauthorized: vi.fn(),
    })
    const response = await client.get('/auth/me', { adapter: successAdapter })
    expect(response.config.headers.Authorization).toBe('Bearer signed.jwt')
    expect(response.config.authSessionGeneration).toBe(3)
  })

  it('does not inject Authorization into a login request', async () => {
    const client = createHttpClient({
      getSession: () => ({ token: 'old.jwt', generation: 1 }),
      onUnauthorized: vi.fn(),
    })
    const response = await client.post('/auth/login', {}, { adapter: successAdapter })
    expect(response.config.headers.Authorization).toBeUndefined()
  })

  it('invokes the secure cleanup callback for a 401 response', async () => {
    const onUnauthorized = vi.fn()
    const client = createHttpClient({
      getSession: () => ({ token: 'signed.jwt', generation: 4 }),
      onUnauthorized,
    })
    const adapter = async (config: AxiosRequestConfig) =>
      Promise.reject({
        isAxiosError: true,
        config,
        response: {
          status: 401,
          data: { message: '请重新登录', traceId: 'trace-401' },
        },
      } satisfies Partial<AxiosError>)
    await expect(client.get('/auth/me', { adapter })).rejects.toBeDefined()
    expect(onUnauthorized).toHaveBeenCalledWith(4)
  })

  it('ignores a late 401 from an older authentication generation', async () => {
    let session = { token: 'old.jwt' as string | null, generation: 7 }
    let rejectOldRequest: ((reason: unknown) => void) | undefined
    let capturedConfig: AxiosRequestConfig | undefined
    const onUnauthorized = vi.fn()
    const client = createHttpClient({ getSession: () => session, onUnauthorized })
    const deferredAdapter = (config: AxiosRequestConfig) => {
      capturedConfig = config
      return new Promise((_resolve, reject) => {
        rejectOldRequest = reject
      })
    }

    const oldRequest = client.get('/orders', { adapter: deferredAdapter })
    await vi.waitFor(() => expect(capturedConfig?.authSessionGeneration).toBe(7))
    session = { token: 'new.jwt', generation: 8 }
    rejectOldRequest?.({
      isAxiosError: true,
      config: capturedConfig,
      response: { status: 401, data: { code: 'TOKEN_EXPIRED', message: '登录凭证已过期' } },
    })

    await expect(oldRequest).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('does not treat a login 401 as an authenticated-session failure', async () => {
    const onUnauthorized = vi.fn()
    const client = createHttpClient({
      getSession: () => ({ token: 'old.jwt', generation: 9 }),
      onUnauthorized,
    })
    const adapter = async (config: AxiosRequestConfig) =>
      Promise.reject({
        isAxiosError: true,
        config,
        response: { status: 401, data: { code: 'AUTHENTICATION_REQUIRED' } },
      } satisfies Partial<AxiosError>)

    await expect(client.post('/auth/login', {}, { adapter })).rejects.toBeDefined()
    expect(onUnauthorized).not.toHaveBeenCalled()
  })
})

describe('idempotency helper', () => {
  it('returns a non-empty unique operation key', () => {
    expect(createIdempotencyKey()).toMatch(/^[A-Za-z0-9-]{16,}$/)
    expect(createIdempotencyKey()).not.toBe(createIdempotencyKey())
  })

  it('keeps an explicitly supplied key stable and leaves GET configuration untouched', () => {
    const config = withIdempotency({ method: 'post', headers: {} }, 'operation-123456')
    expect(config.headers).toEqual({ 'Idempotency-Key': 'operation-123456' })
    expect(withIdempotency({ method: 'get', headers: {} }, 'ignored-key').headers).toEqual({})
  })

  it('keeps one key across timeout and IDEMPOTENCY_IN_PROGRESS until success is known', () => {
    const attempt = createIdempotencyAttempt()
    const payload = { checkId: 'check-id', quantity: '10.000000' }
    const original = attempt.keyFor(payload)

    attempt.failed(new ApiClientError('请求超时', 'REQUEST_FAILED', undefined, true))
    expect(attempt.keyFor(payload)).toBe(original)
    attempt.failed(new ApiClientError('仍在处理', 'IDEMPOTENCY_IN_PROGRESS'))
    expect(attempt.keyFor(payload)).toBe(original)

    attempt.succeeded()
    expect(attempt.keyFor(payload)).not.toBe(original)
  })

  it('keeps one key after CACHE_UNAVAILABLE and any server error with an uncertain outcome', () => {
    const attempt = createIdempotencyAttempt()
    const payload = { issueNo: 'ISS-001', quantity: '10.000000' }
    const original = attempt.keyFor(payload)

    attempt.failed(new ApiClientError('缓存不可用', 'CACHE_UNAVAILABLE'))
    expect(attempt.keyFor(payload)).toBe(original)
    attempt.failed(new ApiClientError('内部错误', 'INTERNAL_ERROR', undefined, false, 500))
    expect(attempt.keyFor(payload)).toBe(original)
  })
})
