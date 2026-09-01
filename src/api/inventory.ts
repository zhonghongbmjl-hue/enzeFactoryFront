import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type { DecimalString } from '@/utils/decimal'
import type {
  InventoryBalance,
  InventoryLedger,
  IssueResult,
  MaterialType,
  ReturnResult,
} from '@/types/inventory'

export function createInventoryApi(client: AxiosInstance) {
  return {
    async balances(materialId: string): Promise<InventoryBalance[]> {
      return (
        await client.get<ApiResponse<InventoryBalance[]>>('/inventory-balances', {
          params: { materialId },
        })
      ).data.data
    },
    async ledgers(materialId: string): Promise<InventoryLedger[]> {
      return (
        await client.get<ApiResponse<InventoryLedger[]>>('/inventory-ledgers', {
          params: { materialId },
        })
      ).data.data
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
      return (
        await client.post<ApiResponse<IssueResult>>(
          '/material-issues',
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async returnMaterial(
      input: {
        returnNo: string
        materialIssueId: string
        quantity: DecimalString
      },
      idempotencyKey?: string,
    ): Promise<ReturnResult> {
      return (
        await client.post<ApiResponse<ReturnResult>>(
          '/material-returns',
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
  }
}

export const inventoryApi = createInventoryApi(http)
