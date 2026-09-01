import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  MasterDataInput,
  MasterDataOption,
  MasterDataPage,
  MasterDataQuery,
  MasterDataRecord,
  MasterDataType,
} from '@/types/masterdata'

export function createMasterDataApi(client: AxiosInstance) {
  return {
    async list(type: MasterDataType, params: MasterDataQuery): Promise<MasterDataPage> {
      const response = await client.get<ApiResponse<MasterDataPage>>(`/${type}`, {
        params,
      })
      return response.data.data
    },
    async select(
      type: MasterDataType,
      query = '',
      limit = 30,
      filters: { organizationId?: string } = {},
    ): Promise<MasterDataOption[]> {
      const response = await client.get<ApiResponse<MasterDataOption[]>>(`/${type}/select`, {
        params: { query, limit, ...filters },
      })
      return response.data.data
    },
    async create(type: MasterDataType, input: MasterDataInput): Promise<MasterDataRecord> {
      const response = await client.post<ApiResponse<MasterDataRecord>>(
        `/${type}`,
        input,
        withIdempotency({ method: 'post' }),
      )
      return response.data.data
    },
    async update(
      type: MasterDataType,
      id: string,
      input: MasterDataInput,
    ): Promise<MasterDataRecord> {
      const response = await client.put<ApiResponse<MasterDataRecord>>(
        `/${type}/${id}`,
        input,
        withIdempotency({ method: 'put' }),
      )
      return response.data.data
    },
    async setStatus(
      type: MasterDataType,
      item: Pick<MasterDataRecord, 'id' | 'version'>,
      active: boolean,
    ): Promise<MasterDataRecord> {
      const response = await client.patch<ApiResponse<MasterDataRecord>>(
        `/${type}/${item.id}/status`,
        { active, version: item.version },
        withIdempotency({ method: 'patch' }),
      )
      return response.data.data
    },
  }
}

export const masterDataApi = createMasterDataApi(http)
