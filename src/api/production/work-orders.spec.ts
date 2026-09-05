import { describe, expect, it, vi } from 'vitest'
import { mockApiResponse } from '../../../tests/api'
import { createProductionApi } from './work-orders'

describe('production api', () => {
  it('keeps production decimals as strings and applies idempotency headers', async () => {
    const post = vi.fn().mockResolvedValue(mockApiResponse({ id: 'wo-1' }))
    const get = vi.fn().mockResolvedValue(mockApiResponse({ content: [] }))
    const api = createProductionApi({ post, get } as never)

    await api.convert('schedule-1', 'convert-key')
    await api.submit('wo-1', 1, 'submit-key')
    await api.approve('wo-1', 2, 'approve-key')
    await api.release('wo-1', 3, 'release-key')
    await api.report(
      'wo-1',
      {
        inputQuantity: '5.000000',
        goodQuantity: '4.000000',
        defectQuantity: '1.000000',
        reworkInputQuantity: '0.500000',
        closingWorkInProgressQuantity: '0.000000',
        operator: 'worker',
        team: 'team-a',
        workHours: '2.000000',
        equipment: 'machine',
        version: 3,
      },
      'report-key',
    )
    await api.list(1, 25)
    await api.reports('wo-1', 2, 10)
    await api.complete(
      'wo-1',
      {
        inspectionId: 'inspection-1',
        manifestId: 'manifest-1',
        startQuantity: '0.000000',
        endQuantity: '4.000000',
        version: 3,
      },
      'completion-key',
    )

    expect(post).toHaveBeenNthCalledWith(
      1,
      '/work-orders/from-schedule',
      { productionScheduleId: 'schedule-1' },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'convert-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      5,
      '/work-orders/wo-1/reports',
      expect.objectContaining({ inputQuantity: '5.000000', workHours: '2.000000' }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'report-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      2,
      '/work-orders/wo-1/submit',
      { version: 1 },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'submit-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      3,
      '/work-orders/wo-1/approve',
      { version: 2 },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'approve-key' } }),
    )
    expect(post).toHaveBeenNthCalledWith(
      4,
      '/work-orders/wo-1/release',
      { version: 3 },
      expect.objectContaining({ headers: { 'Idempotency-Key': 'release-key' } }),
    )
    expect(get).toHaveBeenNthCalledWith(1, '/work-orders', { params: { page: 1, size: 25 } })
    expect(get).toHaveBeenNthCalledWith(2, '/work-orders/wo-1/reports', {
      params: { page: 2, size: 10 },
    })
    expect(post).toHaveBeenNthCalledWith(
      6,
      '/work-orders/wo-1/complete',
      expect.objectContaining({
        inspectionId: 'inspection-1',
        startQuantity: '0.000000',
        endQuantity: '4.000000',
      }),
      expect.objectContaining({ headers: { 'Idempotency-Key': 'completion-key' } }),
    )
  })
})
