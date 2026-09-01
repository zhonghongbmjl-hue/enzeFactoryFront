import type { DecimalString } from '@/utils/decimal'

export type CuttingStatus =
  'DRAFT' | 'RELEASED' | 'CUTTING' | 'PARTIALLY_COMPLETED' | 'COMPLETED' | 'CLOSED'

export interface CutBundle {
  id: string
  cuttingOrderId: string
  orderItemId: string
  skuId: string
  productionBatch: string
  sourceFabricLot: string
  bundleNo: string
  quantity: DecimalString
  createdAt: string
}

export interface CuttingOrder {
  id: string
  cuttingNo: string
  materialIssueId: string
  orderItemId: string
  skuId: string
  productionBatch: string
  sourceFabricLot: string
  inputQuantity: DecimalString
  outputQuantity: DecimalString
  lossQuantity: DecimalString
  excessReturnQuantity: DecimalString
  excessReturnId?: string
  status: CuttingStatus
  bundles: CutBundle[]
  version: number
}

export interface KittingCheck {
  id: string
  orderItemId: string
  skuId: string
  requiredQuantity: DecimalString
  fabricReadyQuantity: DecimalString
  accessoryReadyQuantity: DecimalString
  overallReadyQuantity: DecimalString
  releasedQuantity: DecimalString
  remainingQuantity: DecimalString
  status: 'PENDING' | 'PARTIALLY_READY' | 'READY' | 'RELEASED'
  version: number
}

export interface KittingRelease {
  id: string
  kittingCheckId: string
  quantity: DecimalString
  scheduledQuantity: DecimalString
  remainingForScheduling: DecimalString
  idempotencyKey: string
  version: number
}
