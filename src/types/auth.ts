export interface LoginCredentials {
  tenantCode: string
  username: string
  password: string
}

export interface LoginResult {
  accessToken: string
  tokenType: string
  expiresAt: string
}

export interface UserProfile {
  userId: string
  username: string
  displayName: string
  tenantId: string
  tenantCode: string
  roles: string[]
  permissions: string[]
}

// 保留旧导入路径，业务代码应优先从 @/types/api 导入。
export type { ApiResponse } from './api'
