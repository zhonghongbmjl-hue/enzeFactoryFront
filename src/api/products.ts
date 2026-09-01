import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  BomInput,
  BomPage,
  BomVersion,
  Product,
  ProductInput,
  ProductPage,
  ProductStatus,
  Sku,
  SkuInput,
} from '@/types/product'

export function createProductApi(client: AxiosInstance) {
  return {
    async list(params: {
      query?: string
      status?: ProductStatus
      page: number
      size: number
      sort: string
    }): Promise<ProductPage> {
      const response = await client.get<ApiResponse<ProductPage>>('/products', { params })
      return response.data.data
    },
    async get(id: string): Promise<Product> {
      return (await client.get<ApiResponse<Product>>(`/products/${id}`)).data.data
    },
    async create(input: ProductInput): Promise<Product> {
      return (
        await client.post<ApiResponse<Product>>(
          '/products',
          input,
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async update(id: string, input: ProductInput): Promise<Product> {
      return (await client.put<ApiResponse<Product>>(`/products/${id}`, input)).data.data
    },
    async action(id: string, action: 'activate' | 'deactivate' | 'reopen', version: number) {
      return (
        await client.post<ApiResponse<Product>>(
          `/products/${id}/${action}`,
          { version },
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async skus(productId: string): Promise<Sku[]> {
      return (await client.get<ApiResponse<Sku[]>>(`/products/${productId}/skus`)).data.data
    },
    async createSku(productId: string, input: SkuInput): Promise<Sku> {
      return (
        await client.post<ApiResponse<Sku>>(
          `/products/${productId}/skus`,
          input,
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async updateSku(productId: string, skuId: string, input: SkuInput): Promise<Sku> {
      return (await client.put<ApiResponse<Sku>>(`/products/${productId}/skus/${skuId}`, input))
        .data.data
    },
    async setSkuStatus(productId: string, sku: Sku, active: boolean): Promise<Sku> {
      return (
        await client.patch<ApiResponse<Sku>>(
          `/products/${productId}/skus/${sku.id}/status`,
          { active, version: sku.version },
          withIdempotency({ method: 'patch' }),
        )
      ).data.data
    },
  }
}

export function createBomApi(client: AxiosInstance) {
  const action = async (
    id: string,
    name: 'submit' | 'approve' | 'activate' | 'retire',
    version: number,
  ) =>
    (
      await client.post<ApiResponse<BomVersion>>(
        `/bom-versions/${id}/${name}`,
        { version },
        withIdempotency({ method: 'post' }),
      )
    ).data.data
  return {
    async list(productId: string, page = 0, size = 20): Promise<BomPage> {
      return (
        await client.get<ApiResponse<BomPage>>('/bom-versions', {
          params: { productId, page, size },
        })
      ).data.data
    },
    async get(id: string): Promise<BomVersion> {
      return (await client.get<ApiResponse<BomVersion>>(`/bom-versions/${id}`)).data.data
    },
    async create(input: BomInput): Promise<BomVersion> {
      return (
        await client.post<ApiResponse<BomVersion>>(
          '/bom-versions',
          input,
          withIdempotency({ method: 'post' }),
        )
      ).data.data
    },
    async update(id: string, input: BomInput): Promise<BomVersion> {
      return (await client.put<ApiResponse<BomVersion>>(`/bom-versions/${id}`, input)).data.data
    },
    submit: (id: string, version: number) => action(id, 'submit', version),
    approve: (id: string, version: number) => action(id, 'approve', version),
    activate: (id: string, version: number) => action(id, 'activate', version),
    retire: (id: string, version: number) => action(id, 'retire', version),
  }
}

export const productApi = createProductApi(http)
export const bomApi = createBomApi(http)
