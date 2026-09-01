export type DecimalString = `${number}.${number}`

export type ShipmentStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'PARTIALLY_SIGNED'
  | 'SIGNED'

export interface ShipmentLine {
  id: string
  packingOrderId: string
  packingItemId: string
  orderItemId: string
  skuId: string
  plannedQuantity: DecimalString
  dispatchedQuantity: DecimalString
  signedQuantity: DecimalString
}

export interface Shipment {
  id: string
  salesOrderId: string
  source?: 'NORMAL' | 'AFTER_SALES'
  afterSalesCaseId?: string | null
  status: ShipmentStatus
  requesterId: string
  approverId: string | null
  requestedAt: string | null
  approvedAt: string | null
  signedAt: string | null
  version: number
  lines: ShipmentLine[]
}

export interface PackingSummary {
  id: string
  packageOrderId?: string
  salesOrderId?: string
  boxNo: string
  totalQuantity: DecimalString
  createdAt: string
  lines?: PackingLine[]
}

export interface ShipmentOrderWorkspace {
  salesOrderId: string
  qualityPassedQuantity: DecimalString
  packedQuantity: DecimalString
  packableQuantity: DecimalString
  plannedShipmentQuantity: DecimalString
  dispatchedQuantity: DecimalString
  signedQuantity: DecimalString
  observationBaseline: string | null
  observationDeadline: string | null
  observationPeriodEnded: boolean
  allShipmentsSigned: boolean
  allExceptionsClosed: boolean
  boxes: PackingSummary[]
  boxesHasNext?: boolean
  boxesTotal?: number
  shipments: Shipment[]
  shipmentsHasNext?: boolean
  shipmentsTotal?: number
  afterSalesCases?: AfterSalesCase[]
  afterSalesCasesHasNext?: boolean
  afterSalesCasesTotal?: number
}

export interface PackingLine {
  id: string
  qualityInspectionId: string | null
  afterSalesInspectionId?: string | null
  workOrderId: string
  productionBatchId: string
  orderItemId: string
  skuId: string
  quantity: DecimalString
}

export interface PackingOrder {
  id: string
  packageOrderId: string
  salesOrderId: string
  boxNo: string
  totalQuantity: DecimalString
  createdAt: string
  lines: PackingLine[]
}

export type AfterSalesStatus =
  | 'CREATED'
  | 'RETURN_IN_TRANSIT'
  | 'RECEIVED_AND_QUARANTINED'
  | 'REWORKING'
  | 'QUALITY_INSPECTION'
  | 'REPACKING'
  | 'RESHIPPED'
  | 'SIGNED'
  | 'COMPLETED'

export interface AfterSalesCase {
  id: string
  salesOrderId: string
  orderItemId: string
  skuId: string
  productionBatchId: string
  workOrderId: string
  originalPackingOrderId: string
  originalPackingItemId: string
  originalShipmentId: string
  quantity: DecimalString
  reasonCode: string
  customerFeedback: string
  returnCarrier: string | null
  returnTrackingNo: string | null
  status: AfterSalesStatus
  returnInTransitAt: string | null
  receivedAt: string | null
  signedAt: string | null
  completedAt: string | null
  reworkRecordId: string | null
  afterSalesInspectionId: string | null
  repackingOrderId: string | null
  reshipmentId: string | null
  reconciliationIssueId: string | null
  version: number
  currentReworkStatus: 'IN_PROGRESS' | 'COMPLETED' | null
  attemptCount: number
  cumulativePassed: DecimalString
  releasedQuantity: DecimalString
  disposedQuantity: DecimalString
  remainingQuantity: DecimalString
  currentDisposition: AfterSalesDisposition | null
  effectiveNextAction: EffectiveAfterSalesAction
  effectiveNextPermission: string | null
  dispositionApprovalAllowed: boolean
}

export interface AfterSalesDisposition {
  id: string
  status: 'PENDING' | 'APPROVED'
  type: 'SCRAP' | 'DOWNGRADE' | 'CONCESSION' | 'OTHER_AUTHORIZED' | 'REWORK_OVERRIDE' | null
  outcome: 'RELEASE' | 'DISPOSE' | 'REWORK' | null
  quantity: DecimalString
}

export type EffectiveAfterSalesAction =
  | 'RETURN_TRANSIT'
  | 'RECEIVE_QUARANTINE'
  | 'START_REWORK'
  | 'COMPLETE_REWORK'
  | 'INSPECT'
  | 'PACK'
  | 'CREATE_RESHIPMENT'
  | 'COMPLETE'
  | 'WAIT_DISPOSITION'
  | 'NONE'

export interface Page<T> {
  items: T[]
  page: number
  size: number
  total: number
  hasNext: boolean
  hasPrevious: boolean
}

export type ExceptionCategory =
  'ORDER_CHANGE' | 'REPLENISHMENT' | 'CUSTOMER_EXCHANGE' | 'CUSTOMER_CLAIM' | 'INVENTORY_ANOMALY'
export type ExceptionEvidenceType =
  'ORDER_HISTORY' | 'SHIPMENT' | 'AFTER_SALES' | 'SETTLEMENT_REFERENCE' | 'INVENTORY_LEDGER'

export interface ExceptionCase {
  id: string
  salesOrderId: string
  category: ExceptionCategory
  legacySourceType: string | null
  legacySourceId: string | null
  referenceNo: string
  description: string
  affectedQuantity: DecimalString
  status: 'OPEN' | 'RESOLVED'
  resolutionCode: string | null
  resolutionEvidenceType: ExceptionEvidenceType | null
  resolutionEvidenceRef: string | null
  openedAt: string
  resolvedAt: string | null
  version: number
}

export interface OpenExceptionCaseInput {
  salesOrderId: string
  category: ExceptionCategory
  referenceNo: string
  description: string
  affectedQuantity: DecimalString
}

export interface ResolveExceptionCaseInput {
  expectedVersion: number
  resolutionCode: string
  evidenceType: ExceptionEvidenceType
  evidenceRef: string
}

export interface VersionInput {
  expectedVersion: number
}

export interface QuantityInput {
  shipmentLineId: string
  quantity: DecimalString
}

export type AfterSalesAction =
  | 'return-transit'
  | 'receive-quarantine'
  | 'rework/start'
  | 'rework/complete'
  | 'inspect'
  | 'pack'
  | 'shipment'
  | 'complete'
  | 'disposition/approve'

export type AfterSalesTransitionInput = VersionInput & {
  carrier?: string
  trackingNo?: string
  quantity?: DecimalString
  workNote?: string
  method?: 'SAMPLING' | 'FULL'
  submittedQuantity?: DecimalString
  passedQuantity?: DecimalString
  failedQuantity?: DecimalString
  defectCode?: string
  disposition?: string
  boxNo?: string
  dispositionId?: string
  dispositionType?: 'SCRAP' | 'DOWNGRADE' | 'CONCESSION' | 'OTHER_AUTHORIZED' | 'REWORK_OVERRIDE'
  dispositionOutcome?: 'RELEASE' | 'DISPOSE' | 'REWORK'
  dispositionQuantity?: DecimalString
  additionalAttempts?: number
  decisionReason?: string
  evidenceRef?: string
}
