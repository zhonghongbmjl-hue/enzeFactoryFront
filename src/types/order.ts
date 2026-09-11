export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'MATERIAL_PREPARING'
  | 'READY_FOR_PRODUCTION'
  | 'IN_PRODUCTION'
  | 'QUALITY_INSPECTION'
  | 'PACKING'
  | 'PARTIALLY_SHIPPED'
  | 'SHIPPED'
  | 'AFTER_SALES_OBSERVATION'
  | 'COMPLETED'
  | 'CANCELLED'

export type OrderAction = 'submit' | 'approve' | 'cancel' | 'close'

export interface OrderProgress {
  materialPercent: number
  productionPercent: number
  qualityPercent: number
  shipmentPercent: number
}

export interface OrderClosureReadiness {
  allShipmentsSigned: boolean
  observationPeriodEnded: boolean
  allExceptionsClosed: boolean
  canClose: boolean
}

export interface SalesOrderItem {
  id: string
  productId: string
  skuId: string
  color: string
  size: string
  fit: string
  quantity: number
  deliveryDate: string
  specialProcess?: string
  unitPrice?: number
  productionCompletedQuantity: string
  productionStatus: 'PENDING' | 'PARTIAL' | 'READY'
  version: number
}

export interface BomSnapshotItem {
  materialId: string
  materialType: string
  materialCode: string
  materialName: string
  usageQuantity: number
  lossRate: number
  uom: string
  specification?: string
}

export interface OrderBomSnapshot {
  id: string
  orderItemId: string
  productId: string
  styleNo: string
  skuId: string
  skuCode: string
  sourceProductVersion: number
  sourceSkuVersion: number
  sourceBomVersionId: string
  sourceBomVersionNo: string
  items: BomSnapshotItem[]
}

export interface MaterialRequirement {
  id: string
  orderItemId: string
  materialId: string
  materialType: string
  materialCode: string
  materialName: string
  uom: string
  usageQuantity: number
  lossRate: number
  grossQuantity: number
  availableQuantity: number
  reservedQuantity: number
  netRequirementQuantity: number
}

export interface OrderHistory {
  id: string
  action: string
  fromStatus?: OrderStatus
  toStatus: OrderStatus
  actorId: string
  actorName: string
  occurredAt: string
}

export interface SalesOrder {
  id: string
  orderNo: string
  customerId: string
  customerCode: string
  customerName: string
  orderDate: string
  status: OrderStatus
  version: number
  items: SalesOrderItem[]
  bomSnapshots: OrderBomSnapshot[]
  requirements: MaterialRequirement[]
  progress: OrderProgress
  closureReadiness?: OrderClosureReadiness | null
  history: OrderHistory[]
  submittedAt?: string
  approvedAt?: string
  cancelledAt?: string
  closedAt?: string
  createdAt: string
  updatedAt: string
}

export interface SalesOrderPage {
  content: SalesOrder[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface SalesOrderInput {
  orderNo: string
  customerId: string
  orderDate: string
  items: Array<{
    productId: string
    skuId: string
    color: string
    size: string
    fit: string
    quantity: number
    deliveryDate: string
    specialProcess?: string
    unitPrice?: number
  }>
}

export interface ManualDeliveryEvidence {
  id: string
  salesOrderId: string
  sha256: string
  sizeBytes: number
  contentType: 'image/jpeg' | 'image/png'
  originalFilename: string
  frozenAt: string
}

export interface ManualDeliveryConfirmationInput {
  expectedVersion: number
  reason: string
  evidenceManifestId: string
  confirmedDeliveredAt: string
}

export interface ManualDeliveryConfirmation {
  id: string
  salesOrderId: string
  evidenceManifestId: string
  reason: string
  confirmedDeliveredAt: string
  confirmedBy: string
  createdAt: string
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: '草稿',
  PENDING_APPROVAL: '待审核',
  APPROVED: '已审核',
  MATERIAL_PREPARING: '物料准备中',
  READY_FOR_PRODUCTION: '物料齐套',
  IN_PRODUCTION: '生产中',
  QUALITY_INSPECTION: '质检中',
  PACKING: '包装中',
  PARTIALLY_SHIPPED: '部分发货',
  SHIPPED: '已发货',
  AFTER_SALES_OBSERVATION: '售后观察',
  COMPLETED: '订单完成',
  CANCELLED: '已取消',
}
