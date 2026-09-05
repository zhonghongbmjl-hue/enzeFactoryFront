import type { LoginCredentials, LoginResult, UserProfile } from '@/types/auth'
import { request } from '../http'

export const authApi = {
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    return request.post<LoginResult>('/auth/login', credentials)
  },
  async me(): Promise<UserProfile> {
    return request.get<UserProfile>('/auth/me')
  },
  async logout(): Promise<void> {
    await request.post<null>('/auth/logout')
  },
}
