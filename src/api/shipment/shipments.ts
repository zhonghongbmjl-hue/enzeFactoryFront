import type { ApiRequestClient } from '../http'
import type { IdempotentPost } from './idempotent-post'
import type {
  PackingOrder,
  QuantityInput,
  Shipment,
  ShipmentOrderWorkspace,
} from '@/types/shipment'

export function createShipmentOperations(request: ApiRequestClient, post: IdempotentPost) {
  return {
    async orderWorkspace(orderId: string): Promise<ShipmentOrderWorkspace> {
      return request.get<ShipmentOrderWorkspace>(`/shipment/orders/${orderId}`)
    },
    async getShipment(id: string): Promise<Shipment> {
      return request.get<Shipment>(`/shipments/${id}`)
    },
    pack(
      input: {
        salesOrderId: string
        boxNo: string
        lines: ReadonlyArray<{ qualityInspectionId: string; quantity: string }>
      },
      key: string,
    ) {
      return post<PackingOrder>('/packing-orders', input, key)
    },
    createShipment(
      input: {
        salesOrderId: string
        lines: ReadonlyArray<{ packingOrderId: string; packingItemId: string; quantity: string }>
      },
      key: string,
    ) {
      return post<Shipment>('/shipments', input, key)
    },
    requestApproval(id: string, expectedVersion: number, key: string) {
      return post<Shipment>(`/shipments/${id}/request-approval`, { expectedVersion }, key)
    },
    approve(id: string, expectedVersion: number, key: string) {
      return post<Shipment>(`/shipments/${id}/approve`, { expectedVersion }, key)
    },
    dispatch(id: string, expectedVersion: number, lines: readonly QuantityInput[], key: string) {
      return post<Shipment>(`/shipments/${id}/dispatch`, { expectedVersion, lines }, key)
    },
    sign(id: string, expectedVersion: number, lines: readonly QuantityInput[], key: string) {
      return post<Shipment>(`/shipments/${id}/sign`, { expectedVersion, lines }, key)
    },
  }
}
