import { describe, expect, it, vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { mockApiResponse } from '../../../tests/api'
import { createSalesOrderApi } from './index'

describe('sales order api', () => {
  it('forwards paging and uses idempotent lifecycle endpoints', async () => {
    const get = vi
      .fn()
      .mockResolvedValue(
        mockApiResponse({ content: [], totalElements: 0, totalPages: 0, page: 1, size: 25 }),
      )
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'order-id', version: 4 }))
    const api = createSalesOrderApi({ get, post } as unknown as AxiosInstance)

    await api.list({ page: 1, size: 25, query: 'PO-01', status: 'PENDING_APPROVAL' })
    expect(get).toHaveBeenCalledWith('/sales-orders', {
      params: { page: 1, size: 25, query: 'PO-01', status: 'PENDING_APPROVAL' },
    })

    await api.action('order-id', 'approve', 3)
    expect(post).toHaveBeenCalledWith(
      '/sales-orders/order-id/approve',
      { version: 3 },
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': expect.any(String) }),
      }),
    )
  })

  it('uploads multipart delivery evidence before sending the versioned manual confirmation', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'fact-id' }))
    const api = createSalesOrderApi({ get: vi.fn(), post } as unknown as AxiosInstance)
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'delivery.png', {
      type: 'image/png',
    })

    await api.uploadManualDeliveryEvidence('order-id', file, 'evidence-key')
    const uploadBody = post.mock.calls[0]?.[1]
    expect(uploadBody).toBeInstanceOf(FormData)
    expect((uploadBody as FormData).get('file')).toBe(file)
    expect(post).toHaveBeenNthCalledWith(
      1,
      '/sales-orders/order-id/manual-delivery-evidence',
      uploadBody,
      expect.objectContaining({ headers: { 'Idempotency-Key': 'evidence-key' } }),
    )

    const confirmation = {
      expectedVersion: 9,
      reason: '承运方无签收回传，人工核验客户已收货',
      evidenceManifestId: 'evidence-id',
      confirmedDeliveredAt: '2026-08-25T10:00:00Z',
    }
    await api.confirmManualDelivery('order-id', confirmation, 'confirmation-key')
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/sales-orders/order-id/manual-delivery-confirmations',
      confirmation,
      expect.objectContaining({ headers: { 'Idempotency-Key': 'confirmation-key' } }),
    )
  })
})
