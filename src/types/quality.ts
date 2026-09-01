export type InspectionType = 'FINISHED_PRODUCT'
export type InspectionSubmissionMethod = 'SAMPLING' | 'FULL'
export type InspectionMethod = InspectionSubmissionMethod | 'LEGACY_UNSPECIFIED'
export type InspectionResult = 'PASSED' | 'PARTIAL' | 'FAILED'
export type ReworkStatus = 'PENDING' | 'COMPLETED'
export type QualityStatus =
  | 'PENDING_TRIMMING'
  | 'TRIMMING'
  | 'READY_FOR_QUALITY'
  | 'INSPECTING'
  | 'REWORK'
  | 'NONCONFORMING_PENDING_APPROVAL'
  | 'PASSED'

export interface NonconformingDisposition {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  sourceInspectionId: string
  inspectionType: InspectionType
  inspectionMethod: InspectionMethod
  quantity: string
  chainDepth: number
  maxReworkAttemptsSnapshot: number
  defectCode: string
  status: 'PENDING_APPROVAL'
  createdAt: string
}

export interface QualityHistoryPage {
  page: number
  size: number
  trimmingTotal: number
  inspectionTotal: number
  reworkTotal: number
  dispositionTotal: number
  hasNext: boolean
}

export interface TrimmingRecord {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  quantity: string
  createdAt: string
}

export interface FinishedProductInspection {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  type: InspectionType
  inspectionMethod: InspectionMethod
  submittedQuantity: string
  passedQuantity: string
  failedQuantity: string
  result: InspectionResult
  inspectionVersion: number
  sourceInspectionId: string | null
  sourceReworkOrderId: string | null
  legacyReworkBridgeId: string | null
  chainDepth: number
  defectCode: string | null
  disposition: string | null
  createdAt: string
}

export interface ReworkOrder {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  sourceInspectionId: string
  inspectionType: InspectionType
  inspectionMethod: InspectionMethod
  legacyReworkBridgeId: string | null
  remediatedInspectionMethod: InspectionSubmissionMethod | null
  quantity: string
  chainDepth: number
  defectCode: string | null
  status: ReworkStatus
  completedInspectionId: string | null
  createdAt: string
  completedAt: string | null
}

export interface QualityAggregate {
  salesOrderId: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  requiredQuantity: string
  completedQuantity: string
  trimmedQuantity: string
  trimmingAvailableQuantity: string
  initialSubmittedQuantity: string
  inspectionAvailableQuantity: string
  passedQuantity: string
  failedAuditQuantity: string
  pendingReworkQuantity: string
  pendingDispositionQuantity: string
  status: QualityStatus
  trimmings: TrimmingRecord[]
  inspections: FinishedProductInspection[]
  reworkOrders: ReworkOrder[]
  nonconformingDispositions: NonconformingDisposition[]
  historyPage: QualityHistoryPage
}

export interface WorkOrderQualityFacts {
  workOrderId: string
  productionBatchId: string
  completedQuantity: string
  trimmedQuantity: string
  initialInspectedQuantity: string
  passedQuantity: string
  pendingReworkQuantity: string
  pendingDispositionQuantity: string
  status: QualityStatus
  inspectionMethods: InspectionMethod[]
}

export interface ItemQualityFacts {
  orderItemId: string
  skuId: string
  requiredQuantity: string
  completedQuantity: string
  trimmedQuantity: string
  initialInspectedQuantity: string
  passedQuantity: string
  pendingReworkQuantity: string
  pendingDispositionQuantity: string
  status: QualityStatus
  workOrders: WorkOrderQualityFacts[]
}

export interface OrderQualityFacts {
  salesOrderId: string
  orderNo: string
  mainStatus: string
  requiredQuantity: string
  completedQuantity: string
  trimmedQuantity: string
  initialInspectedQuantity: string
  passedQuantity: string
  pendingReworkQuantity: string
  pendingDispositionQuantity: string
  status: QualityStatus
  items: ItemQualityFacts[]
}

export interface TrimmingInput {
  workOrderId: string
  quantity: string
}

export interface QualityPolicy {
  maxReworkAttempts: number
  source: 'MIGRATION_DEFAULT' | 'TENANT_ADMIN'
  updatedAt: string
}
export interface InspectionInput {
  workOrderId: string
  inspectionMethod: InspectionSubmissionMethod
  submittedQuantity: string
  passedQuantity: string
  failedQuantity: string
  defectCode?: string
  disposition: string
}
export interface ReworkCompletionInput {
  passedQuantity: string
  failedQuantity: string
  disposition: string
}
export interface LegacyReworkBridgeInput {
  selectedMethod: InspectionSubmissionMethod
}
export interface LegacyReworkBridge {
  id: string
  reworkOrderId: string
  selectedMethod: InspectionSubmissionMethod
  createdAt: string
}
