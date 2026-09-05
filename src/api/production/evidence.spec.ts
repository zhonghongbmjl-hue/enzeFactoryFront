import { describe, expect, it, vi } from 'vitest'
import type { ApiRequestClient } from '../http'
import { createProductionEvidenceApi } from './evidence'

describe('production evidence api', () => {
  it('uploads multipart evidence with its digest and reports progress', async () => {
    const post = vi.fn().mockResolvedValue({ tempObjectKey: 'temp-key' })
    const request = { post } as unknown as ApiRequestClient
    const api = createProductionEvidenceApi(request)
    const onProgress = vi.fn()
    const file = new File(['image'], 'inspection.png', { type: 'image/png' })

    await api.upload('wo-1', file, 'sha256-value', onProgress)

    const body = post.mock.calls[0]?.[1]
    const config = post.mock.calls[0]?.[2]
    expect(body).toBeInstanceOf(FormData)
    expect((body as FormData).get('file')).toMatchObject({
      name: 'inspection.png',
      type: 'image/png',
    })
    expect(config).toEqual(
      expect.objectContaining({ headers: { 'X-Content-SHA256': 'sha256-value' } }),
    )
    config?.onUploadProgress?.({ loaded: 5, total: 10 } as never)
    expect(onProgress).toHaveBeenCalledWith(50)
  })
})
