import type { DecimalString } from '@/utils/decimal'

export interface ProductionSchedule {
  id: string
  productionPlanItemId: string
  kittingReleaseId: string
  factoryId: string
  workshopId: string
  productionLineId: string
  startDate: string
  endDate: string
  plannedBatchCode: string
  quantity: DecimalString
  approvalStatus: 'DRAFT' | 'APPROVED'
  version: number
}

export interface ProductionPlanItem {
  id: string
  productionPlanId: string
  salesOrderId: string
  orderItemId: string
  skuId: string
  quantity: DecimalString
  schedule: ProductionSchedule
}

export interface ProductionPlan {
  id: string
  planNo: string
  status: 'DRAFT' | 'APPROVED'
  items: ProductionPlanItem[]
  version: number
}

export interface CreateProductionPlanInput {
  orderId: string
  orderItemId: string
  skuId: string
  kittingReleaseId: string
  factoryId: string
  workshopId: string
  productionLineId: string
  quantity: DecimalString
  startDate: string
  endDate: string
  plannedBatchCode: string
}
