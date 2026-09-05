import type { AxiosRequestConfig } from 'axios'
import { ApiClientError, isUncertainCode } from './errors'

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
