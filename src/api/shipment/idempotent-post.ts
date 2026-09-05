import type { ApiRequestClient } from '../http'
import { withIdempotency } from '../http'

export type IdempotentPost = <T>(url: string, body: unknown, key: string) => Promise<T>

export function createIdempotentPost(request: ApiRequestClient): IdempotentPost {
  return <T>(url: string, body: unknown, key: string) =>
    request.post<T>(url, body, withIdempotency({ method: 'post' }, key))
}
