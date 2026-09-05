import { describe, expect, it, vi } from 'vitest'
import type { AxiosError, AxiosRequestConfig } from 'axios'
import { createHttpClient } from './client'

const successAdapter = async (config: AxiosRequestConfig) => ({
  data: {
    success: true,
    code: 'OK',
    message: 'success',
    data: {},
    traceId: 'test-trace-id',
    timestamp: '2026-09-01T00:00:00Z',
  },
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

describe('HTTP response boundary', () => {
  it('converts a 200 business failure into ApiClientError', async () => {
    const client = createHttpClient({
      getSession: () => ({ token: null, generation: 0 }),
      onUnauthorized: vi.fn(),
    })
    const adapter = async (config: AxiosRequestConfig) => ({
      data: {
        success: false,
        code: 'PRODUCT_DISABLED',
        message: '商品已停用',
        data: null,
        traceId: 'trace-business-error',
        timestamp: '2026-09-01T00:00:00Z',
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })

    await expect(client.get('/products/1', { adapter })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'PRODUCT_DISABLED',
      message: '商品已停用',
      traceId: 'trace-business-error',
      httpStatus: 200,
    })
  })

  it('rejects a malformed successful response envelope', async () => {
    const client = createHttpClient({
      getSession: () => ({ token: null, generation: 0 }),
      onUnauthorized: vi.fn(),
    })
    const adapter = async (config: AxiosRequestConfig) => ({
      data: { data: { id: 'product-1' } },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    })

    await expect(client.get('/products/1', { adapter })).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'INVALID_RESPONSE',
    })
  })
})
