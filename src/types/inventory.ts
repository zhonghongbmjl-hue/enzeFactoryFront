import type { DecimalString } from '@/utils/decimal'

export type MaterialType = 'FABRIC' | 'ACCESSORY'

export interface InventoryBalance {
  id: string
  warehouseId: string
  materialId: string
  batchNo: string
  onHand: DecimalString
  reserved: DecimalString
  available: DecimalString
  version: number
}

export type InventoryEvent =
  | 'RESERVATION_CREATED'
  | 'RESERVATION_RELEASED'
  | 'PUT_AWAY'
  | 'MATERIAL_ISSUED'
  | 'MATERIAL_RETURNED'

export interface InventoryLedger {
  id: string
  reservationId?: string
  putAwayOrderItemId?: string
  materialIssueId?: string
  materialReturnId?: string
  warehouseId: string
  materialId: string
  batchNo: string
  eventType: InventoryEvent
  deltaOnHand: DecimalString
  deltaReserved: DecimalString
  afterOnHand: DecimalString
  afterReserved: DecimalString
  businessReference: string
  idempotencyReference: string
  occurredAt: string
}

export interface MaterialIssue {
  id: string
  issueNo: string
  orderItemId: string
  warehouseId: string
  materialId: string
  materialType: MaterialType
  batchNo: string
  issuedQuantity: DecimalString
  returnedQuantity: DecimalString
  allocatedQuantity: DecimalString
  consumedQuantity: DecimalString
  netIssuedQuantity: DecimalString
  returnableQuantity: DecimalString
  status: 'ISSUED' | 'PARTIALLY_RETURNED' | 'RETURNED'
  version: number
}

export interface IssueResult {
  issue: MaterialIssue
  balance: InventoryBalance
  replayed: boolean
}

export interface ReturnResult {
  materialReturn: {
    id: string
    returnNo: string
    materialIssueId: string
    quantity: DecimalString
    createdAt: string
  }
  issue: MaterialIssue
  balance: InventoryBalance
  replayed: boolean
}
