import type { AxiosInstance } from 'axios'
import { createApiRequest, withIdempotency } from '../http'
import type { BomInput, BomPage, BomVersion } from '@/types/product'

export function createBomApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  const action = async (
    id: string,
    name: 'submit' | 'approve' | 'activate' | 'retire',
    version: number,
  ) =>
    request.post<BomVersion>(
      `/bom-versions/${id}/${name}`,
      { version },
      withIdempotency({ method: 'post' }),
    )
  return {
    async list(productId: string, page = 0, size = 20): Promise<BomPage> {
      return request.get<BomPage>('/bom-versions', { params: { productId, page, size } })
    },
    async get(id: string): Promise<BomVersion> {
      return request.get<BomVersion>(`/bom-versions/${id}`)
    },
    async create(input: BomInput): Promise<BomVersion> {
      return request.post<BomVersion>('/bom-versions', input, withIdempotency({ method: 'post' }))
    },
    async update(id: string, input: BomInput): Promise<BomVersion> {
      return request.put<BomVersion>(`/bom-versions/${id}`, input)
    },
    submit: (id: string, version: number) => action(id, 'submit', version),
    approve: (id: string, version: number) => action(id, 'approve', version),
    activate: (id: string, version: number) => action(id, 'activate', version),
    retire: (id: string, version: number) => action(id, 'retire', version),
  }
}
