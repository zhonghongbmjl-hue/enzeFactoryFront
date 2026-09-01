import type { OrderStatus } from './order'

export type DeliveryRisk = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'OVERDUE'

export interface OrderControlTowerRow {
  orderId: string
  orderNo: string
  customerName: string
  deliveryDate: string
  status: OrderStatus
  procurementPercent: number
  fabricKittingPercent: number
  accessoryKittingPercent: number
  overallKittingPercent: number
  productionPercent: number
  selfInspectionStatus: string
  frozenImageCount: number
  correctionCount: number
  lastSelfInspectionAt: string | null
  qualityPassRate: number
  reworkRate: number
  shipmentPercent: number
  deliveryRisk: DeliveryRisk
}

export interface OrderControlTowerPage {
  content: OrderControlTowerRow[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}
