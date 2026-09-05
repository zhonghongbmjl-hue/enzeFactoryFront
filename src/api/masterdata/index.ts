import type { AxiosInstance } from 'axios'
import { createApiRequest, http, withIdempotency } from '../http'
import type {
  MasterDataInput,
  MasterDataOption,
  MasterDataPage,
  MasterDataQuery,
  MasterDataRecord,
  MasterDataType,
} from '@/types/masterdata'

export function createMasterDataApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async list(type: MasterDataType, params: MasterDataQuery): Promise<MasterDataPage> {
      return request.get<MasterDataPage>(`/${type}`, { params })
    },
    async select(
      type: MasterDataType,
      query = '',
      limit = 30,
      filters: { organizationId?: string } = {},
    ): Promise<MasterDataOption[]> {
      return request.get<MasterDataOption[]>(`/${type}/select`, {
        params: { query, limit, ...filters },
      })
    },
    async create(type: MasterDataType, input: MasterDataInput): Promise<MasterDataRecord> {
      return request.post<MasterDataRecord>(`/${type}`, input, withIdempotency({ method: 'post' }))
    },
    async update(
      type: MasterDataType,
      id: string,
      input: MasterDataInput,
    ): Promise<MasterDataRecord> {
      return request.put<MasterDataRecord>(
        `/${type}/${id}`,
        input,
        withIdempotency({ method: 'put' }),
      )
    },
    async setStatus(
      type: MasterDataType,
      item: Pick<MasterDataRecord, 'id' | 'version'>,
      active: boolean,
    ): Promise<MasterDataRecord> {
      return request.patch<MasterDataRecord>(
        `/${type}/${item.id}/status`,
        { active, version: item.version },
        withIdempotency({ method: 'patch' }),
      )
    },
  }
}

export const masterDataApi = createMasterDataApi(http)
