import type { LoginCredentials, LoginResult, UserProfile } from '@/types/auth'
import type { ApiResponse } from '@/types/auth'
import { ApiClientError, http } from './http'

function dataOf<T>(response: ApiResponse<T>): T {
  if (!response.success) {
    throw new ApiClientError(response.message, response.code, response.traceId)
  }
  return response.data
}

export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const response = await http.post<ApiResponse<LoginResult>>('/auth/login', credentials)
    return dataOf(response.data)
  },
  async me(): Promise<UserProfile> {
    const response = await http.get<ApiResponse<UserProfile>>('/auth/me')
    return dataOf(response.data)
  },
  async logout(): Promise<void> {
    const response = await http.post<ApiResponse<null>>('/auth/logout')
    dataOf(response.data)
  },
}
