import type { DecimalString } from '@/utils/decimal'

export type WorkOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'RELEASED'
  | 'IN_PRODUCTION'
  | 'PROCESS_INSPECTION'
  | 'READY_TO_COMPLETE'
  | 'TRIMMING'
  | 'READY_FOR_QUALITY'
  | 'COMPLETED'
  | 'CLOSED'

export interface ProductionBatch {
  id: string
  productionScheduleId: string
  productionPlanItemId: string
  orderItemId: string
  skuId: string
  factoryId: string
  workshopId: string
  productionLineId: string
  plannedBatchCode: string
  plannedQuantity: DecimalString
  startDate: string
  endDate: string
  status: 'PLANNED' | 'RELEASED' | 'IN_PRODUCTION' | 'COMPLETED'
  version: number
}

export interface ProductionReport {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  openingWorkInProgressQuantity: DecimalString
  inputQuantity: DecimalString
  goodQuantity: DecimalString
  defectQuantity: DecimalString
  reworkQuantity: DecimalString
  openingReworkPendingQuantity: DecimalString
  reworkInputQuantity: DecimalString
  closingReworkPendingQuantity: DecimalString
  closingWorkInProgressQuantity: DecimalString
  flowModelVersion: 1 | 2
  operator: string
  team: string
  workHours: DecimalString
  equipment: string
  reportedAt: string
}

export interface WorkOrder {
  id: string
  workOrderNo: string
  productionScheduleId: string
  productionPlanItemId: string
  orderItemId: string
  skuId: string
  factoryId: string
  workshopId: string
  productionLineId: string
  plannedQuantity: DecimalString
  status: WorkOrderStatus
  totalInputQuantity: DecimalString
  totalGoodQuantity: DecimalString
  totalDefectQuantity: DecimalString
  totalReworkQuantity: DecimalString
  workInProgressQuantity: DecimalString
  unstartedQuantity: DecimalString
  reworkPendingQuantity: DecimalString
  approvedScrapQuantity: DecimalString
  productionBatch: ProductionBatch
  version: number
  createdAt: string
  updatedAt: string
}

export interface ProductionReportInput {
  inputQuantity: DecimalString
  goodQuantity: DecimalString
  defectQuantity: DecimalString
  reworkInputQuantity: DecimalString
  closingWorkInProgressQuantity: DecimalString
  operator: string
  team: string
  workHours: DecimalString
  equipment: string
  version: number
}

export interface ProductionCompletionInput {
  inspectionId: string
  manifestId: string
  startQuantity: DecimalString
  endQuantity: DecimalString
  version: number
}

export interface ProductionCompletion {
  id: string
  workOrderId: string
  inspectionId: string
  manifestId: string
  startQuantity: DecimalString
  endQuantity: DecimalString
  completedQuantity: DecimalString
  outcome: 'PARTIAL' | 'READY_TO_COMPLETE'
  createdAt: string
  evidence: Array<{
    objectId: string
    versionId: string
    etag: string
    sha256: string
    contentType: string
    contentLength: number
  }>
}

export interface ProductionBatchSummary {
  plannedBatchCode: string
  startDate: string
  endDate: string
  status: ProductionBatch['status']
}

export interface WorkOrderSummary {
  id: string
  workOrderNo: string
  productionLineId: string
  plannedQuantity: DecimalString
  status: WorkOrderStatus
  totalInputQuantity: DecimalString
  totalGoodQuantity: DecimalString
  totalDefectQuantity: DecimalString
  totalReworkQuantity: DecimalString
  workInProgressQuantity: DecimalString
  reworkPendingQuantity: DecimalString
  approvedScrapQuantity: DecimalString
  productionBatch: ProductionBatchSummary
  version: number
  createdAt: string
  updatedAt: string
}

export interface PageResponse<T> {
  content: T[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

export interface TemporaryEvidenceUpload {
  tempObjectKey: string
  sha256: string
  contentType: string
  sizeBytes: number
  originalFilename: string
}

export interface EvidenceReference {
  tempObjectKey: string
  sha256: string
}

export interface FrozenEvidenceObject {
  id: string
  versionId: string
  etag: string
  sha256: string
  contentType: string
  originalFilename: string
  sizeBytes: number
  frozenAt: string
}

export interface ProcessCorrection {
  id: string
  failedInspectionId: string
  description: string
  status: 'OPEN' | 'COMPLETED'
  createdAt: string
  completedAt: string | null
  version: number
}

export interface ProcessInspectionView {
  id: string
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  plannedQuantity: DecimalString
  inspectedQuantity: DecimalString
  passedQuantity: DecimalString
  failedQuantity: DecimalString
  coverageVerified: boolean
  inspectionVersion: number
  result: 'PASSED' | 'FAILED'
  inspector: string
  remarks: string | null
  version: number
  createdAt: string
  manifest: {
    id: string
    aggregateSha256: string
    totalBytes: number
    frozenAt: string
    objects: FrozenEvidenceObject[]
  }
  correction: ProcessCorrection | null
}
