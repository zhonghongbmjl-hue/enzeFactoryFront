export type MaterialBranch = 'FABRIC' | 'ACCESSORY'
export type PurchasePlanStatus =
  'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PARTIALLY_ORDERED' | 'ORDERED' | 'COMPLETED'
export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'COMPLETED'
export type IncomingInspectionStatus =
  | 'INSPECTING'
  | 'PASSED'
  | 'PARTIALLY_PASSED'
  | 'REJECTED'
  | 'PUT_AWAY'
  | 'RETURN_PENDING'
  | 'COMPLETED'
export type IncomingInspectionAction =
  'FINISH' | 'CREATE_PUT_AWAY' | 'CREATE_RESOLUTION' | 'COMPLETE'

export interface PurchasePlanItem {
  id: string
  requirementId: string
  orderItemId: string
  bomSnapshotId: string
  materialId: string
  materialType: MaterialBranch
  materialCode: string
  materialName: string
  uom: string
  plannedQuantity: number
  orderedQuantity: number
  receivedQuantity: number
  inspectedQuantity: number
  passedQuantity: number
  rejectedQuantity: number
  putAwayQuantity: number
}

export interface PurchasePlan {
  id: string
  salesOrderId: string
  orderNo: string
  materialType: MaterialBranch
  status: PurchasePlanStatus
  version: number
  items: PurchasePlanItem[]
}

export interface ProcurementWorkspace {
  salesOrderId: string
  branches: PurchasePlan[]
}

export interface PurchaseOrderItem {
  id: string
  purchasePlanItemId: string
  requirementId: string
  orderItemId: string
  bomSnapshotId: string
  materialId: string
  materialType: MaterialBranch
  orderedQuantity: number
  overReceiptLimit: number
  receivedQuantity: number
  remainingQuantity: number
}

export interface PurchaseOrder {
  id: string
  orderNo: string
  supplierId: string
  purchasePlanId: string
  status: PurchaseOrderStatus
  version: number
  remainingQuantity: number
  items: PurchaseOrderItem[]
}

export interface GoodsReceiptItem {
  id: string
  purchaseOrderItemId: string
  requirementId: string
  orderItemId: string
  bomSnapshotId: string
  materialId: string
  materialType: MaterialBranch
  supplierBatch: string
  receivedQuantity: number
}

export interface GoodsReceipt {
  id: string
  receiptNo: string
  purchaseOrderId: string
  status: 'PENDING_INSPECTION'
  version: number
  items: GoodsReceiptItem[]
}

export interface IncomingInspectionItem {
  id: string
  receiptItemId: string
  requirementId: string
  orderItemId: string
  bomSnapshotId: string
  materialId: string
  materialType: MaterialBranch
  supplierBatch: string
  inspectedQuantity: number
  passedQuantity: number
  rejectedQuantity: number
  defectNote: string
}

export interface IncomingInspection {
  id: string
  inspectionNo: string
  receiptId: string
  status: IncomingInspectionStatus
  version: number
  putAwayRemainingQuantity: number
  resolutionRemainingQuantity: number
  allowedActions: IncomingInspectionAction[]
  items: IncomingInspectionItem[]
}

export function inspectionActionVisible(
  inspection: IncomingInspection,
  action: IncomingInspectionAction,
): boolean {
  return inspection.allowedActions.includes(action)
}

export interface PutAwayOrder {
  id: string
  putAwayNo: string
  warehouseId: string
  status: 'DRAFT' | 'COMPLETED'
  version: number
  items: Array<{
    id: string
    inspectionItemId: string
    requirementId: string
    orderItemId: string
    bomSnapshotId: string
    materialId: string
    materialType: MaterialBranch
    supplierBatch: string
    quantity: number
  }>
}

export const PLAN_STATUS_LABELS: Record<PurchasePlanStatus, string> = {
  DRAFT: '待提交',
  PENDING_APPROVAL: '待审核',
  APPROVED: '已审核',
  PARTIALLY_ORDERED: '部分下单',
  ORDERED: '已下单',
  COMPLETED: '已完成',
}
