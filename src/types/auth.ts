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

export interface ApiResponse<T> {
  success: boolean
  code: string
  message: string
  data: T
  traceId: string
  timestamp: string
}
