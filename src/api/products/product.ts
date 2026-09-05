import type { AxiosInstance } from 'axios'
import { createApiRequest, withIdempotency } from '../http'
import type {
  Product,
  ProductInput,
  ProductPage,
  ProductStatus,
  Sku,
  SkuInput,
} from '@/types/product'

export function createProductApi(client: AxiosInstance) {
  const request = createApiRequest(client)
  return {
    async list(params: {
      query?: string
      status?: ProductStatus
      page: number
      size: number
      sort: string
    }): Promise<ProductPage> {
      return request.get<ProductPage>('/products', { params })
    },
    async get(id: string): Promise<Product> {
      return request.get<Product>(`/products/${id}`)
    },
    async create(input: ProductInput): Promise<Product> {
      return request.post<Product>('/products', input, withIdempotency({ method: 'post' }))
    },
    async update(id: string, input: ProductInput): Promise<Product> {
      return request.put<Product>(`/products/${id}`, input)
    },
    async action(id: string, action: 'activate' | 'deactivate' | 'reopen', version: number) {
      return request.post<Product>(
        `/products/${id}/${action}`,
        { version },
        withIdempotency({ method: 'post' }),
      )
    },
    async skus(productId: string): Promise<Sku[]> {
      return request.get<Sku[]>(`/products/${productId}/skus`)
    },
    async createSku(productId: string, input: SkuInput): Promise<Sku> {
      return request.post<Sku>(
        `/products/${productId}/skus`,
        input,
        withIdempotency({ method: 'post' }),
      )
    },
    async updateSku(productId: string, skuId: string, input: SkuInput): Promise<Sku> {
      return request.put<Sku>(`/products/${productId}/skus/${skuId}`, input)
    },
    async setSkuStatus(productId: string, sku: Sku, active: boolean): Promise<Sku> {
      return request.patch<Sku>(
        `/products/${productId}/skus/${sku.id}/status`,
        { active, version: sku.version },
        withIdempotency({ method: 'patch' }),
      )
    },
  }
}
