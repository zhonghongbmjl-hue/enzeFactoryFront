import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { mockApiResponse } from '../../../tests/api'
import { createProductApi } from './product'

describe('product api', () => {
  it('forwards server paging and never writes status through update', async () => {
    const get = vi.fn().mockResolvedValue(mockApiResponse({ content: [], totalElements: 0 }))
    const put = vi.fn().mockResolvedValue(mockApiResponse({}))
    const patch = vi.fn().mockResolvedValue(mockApiResponse({}))
    const api = createProductApi({ get, put, patch } as unknown as AxiosInstance)
    await api.list({ page: 2, size: 20, sort: 'styleNo,asc', status: 'ACTIVE' })
    expect(get).toHaveBeenCalledWith('/products', {
      params: { page: 2, size: 20, sort: 'styleNo,asc', status: 'ACTIVE' },
    })
    await api.update('product-id', { styleNo: 'P1', name: '纸样', version: 3 })
    expect(put).toHaveBeenCalledWith('/products/product-id', {
      styleNo: 'P1',
      name: '纸样',
      version: 3,
    })
    const sku = {
      id: 'sku-id',
      productId: 'product-id',
      skuCode: 'P1-BK-M',
      color: '黑',
      colorCode: 'BK',
      size: 'M',
      fit: 'REGULAR',
      active: true,
      version: 2,
      createdAt: '',
      updatedAt: '',
    }
    await api.updateSku('product-id', 'sku-id', {
      skuCode: sku.skuCode,
      color: sku.color,
      colorCode: sku.colorCode,
      size: sku.size,
      fit: sku.fit,
      version: sku.version,
    })
    await api.setSkuStatus('product-id', sku, false)
    expect(put).toHaveBeenCalledWith(
      '/products/product-id/skus/sku-id',
      expect.objectContaining({ version: 2 }),
    )
    expect(patch).toHaveBeenCalledWith(
      '/products/product-id/skus/sku-id/status',
      { active: false, version: 2 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )
  })
})
