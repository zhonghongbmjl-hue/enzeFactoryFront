import { describe, expect, it } from 'vitest'
import { ApiClientError } from './errors'
import { createIdempotencyAttempt, createIdempotencyKey, withIdempotency } from './idempotency'

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
