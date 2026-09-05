import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { ApiResponse } from '@/types/api'
import { http } from './client'
import { unwrapApiResponse } from './errors'

export interface ApiRequestClient {
  request<T>(config: AxiosRequestConfig): Promise<T>
  get<T>(url: string, config?: AxiosRequestConfig): Promise<T>
  delete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
}

async function responseData<T>(operation: Promise<AxiosResponse<ApiResponse<T>>>): Promise<T> {
  const response = await operation
  return unwrapApiResponse(response.data, response.status)
}

/** 面向业务 API 的二次封装：调用方只接收 data。 */
export function createApiRequest(client: AxiosInstance): ApiRequestClient {
  return {
    request: <T>(config: AxiosRequestConfig) =>
      responseData(client.request<ApiResponse<T>>(config)),
    get: <T>(url: string, config?: AxiosRequestConfig) =>
      responseData(
        config ? client.get<ApiResponse<T>>(url, config) : client.get<ApiResponse<T>>(url),
      ),
    delete: <T = void>(url: string, config?: AxiosRequestConfig) =>
      responseData(
        config ? client.delete<ApiResponse<T>>(url, config) : client.delete<ApiResponse<T>>(url),
      ),
    post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      responseData(
        config
          ? client.post<ApiResponse<T>>(url, data, config)
          : client.post<ApiResponse<T>>(url, data),
      ),
    put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      responseData(
        config
          ? client.put<ApiResponse<T>>(url, data, config)
          : client.put<ApiResponse<T>>(url, data),
      ),
    patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
      responseData(
        config
          ? client.patch<ApiResponse<T>>(url, data, config)
          : client.patch<ApiResponse<T>>(url, data),
      ),
  }
}

export const request = createApiRequest(http)
