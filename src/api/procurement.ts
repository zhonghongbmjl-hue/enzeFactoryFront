import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  GoodsReceipt,
  IncomingInspection,
  ProcurementWorkspace,
  PurchaseOrder,
  PurchasePlan,
  PutAwayOrder,
} from '@/types/procurement'

type PlanAction = 'submit' | 'approve' | 'complete'
type PurchaseOrderAction = 'submit' | 'approve' | 'place' | 'complete'
type InspectionAction = 'finish' | 'complete'

export function createProcurementApi(client: AxiosInstance) {
  const post = async <T>(path: string, body: unknown): Promise<T> =>
    (await client.post<ApiResponse<T>>(path, body, withIdempotency({ method: 'post' }))).data.data

  return {
    async workspace(orderId: string): Promise<ProcurementWorkspace> {
      return (await client.get<ApiResponse<ProcurementWorkspace>>(`/procurement/orders/${orderId}`))
        .data.data
    },
    async planAction(id: string, action: PlanAction, version: number): Promise<PurchasePlan> {
      return post(`/purchase-plans/${id}/${action}`, { version })
    },
    async createPurchaseOrder(input: {
      orderNo: string
      supplierId: string
      purchasePlanId: string
      items: Array<{
        purchasePlanItemId: string
        orderedQuantity: number
        overReceiptLimit: number
      }>
    }): Promise<PurchaseOrder> {
      return post('/purchase-orders', input)
    },
    async purchaseOrderAction(
      id: string,
      action: PurchaseOrderAction,
      version: number,
    ): Promise<PurchaseOrder> {
      return post(`/purchase-orders/${id}/${action}`, { version })
    },
    async receive(input: {
      receiptNo: string
      purchaseOrderId: string
      items: Array<{ purchaseOrderItemId: string; supplierBatch: string; quantity: number }>
    }): Promise<GoodsReceipt> {
      return post('/receipts', input)
    },
    async inspect(input: {
      inspectionNo: string
      receiptId: string
      items: Array<{
        receiptItemId: string
        inspectedQuantity: number
        passedQuantity: number
        rejectedQuantity: number
        defectNote: string
      }>
    }): Promise<IncomingInspection> {
      return post('/incoming-inspections', input)
    },
    async inspectionAction(
      id: string,
      action: InspectionAction,
      version: number,
    ): Promise<IncomingInspection> {
      return post(`/incoming-inspections/${id}/${action}`, { version })
    },
    async createPutAway(input: {
      putAwayNo: string
      inspectionId: string
      warehouseId: string
      items: Array<{ inspectionItemId: string; quantity: number }>
    }): Promise<PutAwayOrder> {
      return post('/put-away-orders', input)
    },
    async completePutAway(id: string, version: number): Promise<PutAwayOrder> {
      return post(`/put-away-orders/${id}/complete`, { version })
    },
    async resolveRejected(
      inspectionId: string,
      input: { type: 'RETURN' | 'REPLENISHMENT'; quantity: number; note: string },
    ): Promise<{ id: string; type: string; quantity: number; note: string }> {
      return post(`/incoming-inspections/${inspectionId}/resolutions`, input)
    },
  }
}

export const procurementApi = createProcurementApi(http)
