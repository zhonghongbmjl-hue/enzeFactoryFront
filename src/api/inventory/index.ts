import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
import type { DecimalString } from '@/utils/decimal'
import type {
  InventoryBalance,
  InventoryLedger,
  IssueResult,
  MaterialType,
  ReturnResult,
} from '@/types/inventory'

export function createInventoryApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async balances(materialId: string): Promise<InventoryBalance[]> {
      return request.get<InventoryBalance[]>('/inventory-balances', { params: { materialId } })
    },
    async ledgers(materialId: string): Promise<InventoryLedger[]> {
      return request.get<InventoryLedger[]>('/inventory-ledgers', { params: { materialId } })
    },
    async issue(
      input: {
        issueNo: string
        orderItemId: string
        warehouseId: string
        materialId: string
        materialType: MaterialType
        batchNo: string
        quantity: DecimalString
      },
      idempotencyKey?: string,
    ): Promise<IssueResult> {
      return request.post<IssueResult>(
        '/material-issues',
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
    async returnMaterial(
      input: {
        returnNo: string
        materialIssueId: string
        quantity: DecimalString
      },
      idempotencyKey?: string,
    ): Promise<ReturnResult> {
      return request.post<ReturnResult>(
        '/material-returns',
        input,
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    },
  }
}

export const inventoryApi = createInventoryApi(http)
