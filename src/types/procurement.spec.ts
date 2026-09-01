import { describe, expect, it } from 'vitest'
import { inspectionActionVisible, type IncomingInspection } from './procurement'

function inspection(
  status: IncomingInspection['status'],
  putAwayRemainingQuantity: number,
  resolutionRemainingQuantity: number,
  allowedActions: IncomingInspection['allowedActions'],
): IncomingInspection {
  return {
    id: 'inspection-id',
    inspectionNo: 'IQC-1',
    receiptId: 'receipt-id',
    status,
    version: 1,
    putAwayRemainingQuantity,
    resolutionRemainingQuantity,
    allowedActions,
    items: [],
  }
}

describe('来料检验处置动作可见性', () => {
  it('先处置不合格品后仅展示合格品上架动作', () => {
    const value = inspection('PUT_AWAY', 4, 0, ['CREATE_PUT_AWAY'])

    expect(inspectionActionVisible(value, 'CREATE_PUT_AWAY')).toBe(true)
    expect(inspectionActionVisible(value, 'CREATE_RESOLUTION')).toBe(false)
    expect(inspectionActionVisible(value, 'COMPLETE')).toBe(false)
  })

  it('先完成合格品上架后仅展示不合格品处置动作', () => {
    const value = inspection('RETURN_PENDING', 0, 1, ['CREATE_RESOLUTION'])

    expect(inspectionActionVisible(value, 'CREATE_PUT_AWAY')).toBe(false)
    expect(inspectionActionVisible(value, 'CREATE_RESOLUTION')).toBe(true)
    expect(inspectionActionVisible(value, 'COMPLETE')).toBe(false)
  })

  it('两个分支都完成后仅展示显式完成动作', () => {
    const value = inspection('PUT_AWAY', 0, 0, ['COMPLETE'])

    expect(inspectionActionVisible(value, 'CREATE_PUT_AWAY')).toBe(false)
    expect(inspectionActionVisible(value, 'CREATE_RESOLUTION')).toBe(false)
    expect(inspectionActionVisible(value, 'COMPLETE')).toBe(true)
  })
})
