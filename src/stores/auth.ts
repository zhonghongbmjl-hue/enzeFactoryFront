import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { ApiClientError } from '@/api/http'
import type { LoginCredentials, UserProfile } from '@/types/auth'
import { clearTenantCaches } from './tenantCache'

const SESSION_KEY = 'garment.auth'
const SESSION_SCHEMA_VERSION = 1
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TENANT_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/
const USERNAME_PATTERN = /^[A-Za-z0-9._@-]{1,64}$/
const AUTHORITY_PATTERN = /^[A-Z][A-Z0-9_]*$/
const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/
const EXPIRY_SAFETY_MARGIN_MS = 30_000

export type SessionStatus =
  'anonymous' | 'restored' | 'validating' | 'authenticated' | 'validation-error'
export type SessionValidationResult = 'valid' | 'anonymous' | 'retry'

interface ValidationFlight {
  generation: number
  promise: Promise<SessionValidationResult>
  marker: object
}

const validationFlights = new WeakMap<object, ValidationFlight>()

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127)
  })
}

function isStringWithin(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= minimum &&
    value.length <= maximum &&
    value.trim().length >= minimum &&
    !containsControlCharacter(value)
  )
}

function isAuthorityList(value: unknown, maximumItemLength: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 256 &&
    value.every(
      (item) => isStringWithin(item, 1, maximumItemLength) && AUTHORITY_PATTERN.test(item),
    )
  )
}

function parseIsoInstant(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match = ISO_INSTANT_PATTERN.exec(value)
  if (!match) return null
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch)) return null
  const date = new Date(epoch)
  const expected = match.slice(1, 7).map(Number)
  const actual = [
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ]
  return actual.every((part, index) => part === expected[index]) ? epoch : null
}

function isCredentialRejection(error: unknown): boolean {
  return (
    error instanceof ApiClientError &&
    ['AUTHENTICATION_REQUIRED', 'TOKEN_INVALID', 'TOKEN_EXPIRED'].includes(error.code)
  )
}

function isSameTenant(left: UserProfile, right: UserProfile): boolean {
  return left.tenantId === right.tenantId && left.tenantCode === right.tenantCode
}

function isProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<UserProfile>
  return (
    isStringWithin(candidate.userId, 36, 36) &&
    UUID_PATTERN.test(candidate.userId) &&
    isStringWithin(candidate.username, 1, 64) &&
    USERNAME_PATTERN.test(candidate.username) &&
    isStringWithin(candidate.displayName, 1, 128) &&
    isStringWithin(candidate.tenantId, 36, 36) &&
    UUID_PATTERN.test(candidate.tenantId) &&
    isStringWithin(candidate.tenantCode, 2, 64) &&
    TENANT_CODE_PATTERN.test(candidate.tenantCode) &&
    isAuthorityList(candidate.roles, 64) &&
    isAuthorityList(candidate.permissions, 100)
  )
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: null as string | null,
    profile: null as UserProfile | null,
    expiresAt: null as string | null,
    generation: 0,
    sessionStatus: 'anonymous' as SessionStatus,
    sessionValidationMessage: '',
  }),
  getters: {
    isAuthenticated: (state) =>
      Boolean(state.token && state.profile && state.sessionStatus === 'authenticated'),
    permissions: (state) => new Set(state.profile?.permissions ?? []),
  },
  actions: {
    restoreSession(nowEpochMs = Date.now()): void {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (!stored) return
      try {
        const parsed = JSON.parse(stored) as {
          schemaVersion?: unknown
          token?: unknown
          expiresAt?: unknown
          profile?: unknown
          authGeneration?: unknown
        }
        const expiryEpoch = parseIsoInstant(parsed.expiresAt)
        if (
          parsed.schemaVersion === SESSION_SCHEMA_VERSION &&
          isStringWithin(parsed.token, 1, 8192) &&
          typeof parsed.expiresAt === 'string' &&
          expiryEpoch !== null &&
          expiryEpoch > nowEpochMs + EXPIRY_SAFETY_MARGIN_MS &&
          Number.isSafeInteger(parsed.authGeneration) &&
          Number(parsed.authGeneration) >= 1 &&
          isProfile(parsed.profile)
        ) {
          const persistedGeneration = Number(parsed.authGeneration)
          this.generation = Math.max(this.generation + 1, persistedGeneration)
          this.token = parsed.token
          this.profile = parsed.profile
          this.expiresAt = parsed.expiresAt
          this.sessionStatus = 'restored'
          this.sessionValidationMessage = ''
          return
        }
      } catch {
        // Invalid session data is removed below.
      }
      this.clearSession()
    },
    async validateRestoredSession(): Promise<SessionValidationResult> {
      if (this.sessionStatus === 'authenticated') return 'valid'
      if (this.sessionStatus === 'anonymous') return 'anonymous'
      const validationGeneration = this.generation
      const validationOwner = this as object
      const existingFlight = validationFlights.get(validationOwner)
      if (existingFlight?.generation === validationGeneration) {
        return existingFlight.promise
      }
      this.sessionStatus = 'validating'
      this.sessionValidationMessage = ''
      const restoredProfile = this.profile
      const flightMarker = {}
      const operation = (async (): Promise<SessionValidationResult> => {
        try {
          const verifiedProfile = await authApi.me()
          if (this.generation !== validationGeneration) return 'anonymous'
          if (!isProfile(verifiedProfile)) {
            this.clearSession()
            return 'anonymous'
          }
          if (!restoredProfile || !isSameTenant(restoredProfile, verifiedProfile)) {
            this.clearSession()
            this.sessionValidationMessage = '会话租户信息无效，请重新登录'
            return 'anonymous'
          }
          this.profile = verifiedProfile
          this.sessionStatus = 'authenticated'
          sessionStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              schemaVersion: SESSION_SCHEMA_VERSION,
              token: this.token,
              expiresAt: this.expiresAt,
              profile: this.profile,
              authGeneration: this.generation,
            }),
          )
          return 'valid'
        } catch (error) {
          if (this.generation !== validationGeneration) return 'anonymous'
          if (isCredentialRejection(error)) {
            this.clearSession()
            return 'anonymous'
          }
          this.sessionStatus = 'validation-error'
          this.sessionValidationMessage = '暂时无法验证登录状态，请检查网络后重试'
          return 'retry'
        } finally {
          if (validationFlights.get(validationOwner)?.marker === flightMarker) {
            validationFlights.delete(validationOwner)
          }
        }
      })()
      validationFlights.set(validationOwner, {
        generation: validationGeneration,
        promise: operation,
        marker: flightMarker,
      })
      return operation
    },
    async login(credentials: LoginCredentials): Promise<void> {
      const result = await authApi.login(credentials)
      const expiryEpoch = parseIsoInstant(result.expiresAt)
      if (expiryEpoch === null || expiryEpoch <= Date.now() + EXPIRY_SAFETY_MARGIN_MS) {
        this.clearSession()
        throw new ApiClientError('登录凭证有效期无效，请重新登录', 'TOKEN_INVALID')
      }
      this.generation += 1
      this.token = result.accessToken
      this.expiresAt = result.expiresAt
      this.sessionStatus = 'validating'
      try {
        const verifiedProfile = await authApi.me()
        if (!isProfile(verifiedProfile)) {
          throw new ApiClientError('登录用户信息无效，请重新登录', 'TOKEN_INVALID')
        }
        clearTenantCaches()
        this.profile = verifiedProfile
        this.sessionStatus = 'authenticated'
        this.sessionValidationMessage = ''
        sessionStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            schemaVersion: SESSION_SCHEMA_VERSION,
            token: this.token,
            expiresAt: this.expiresAt,
            profile: this.profile,
            authGeneration: this.generation,
          }),
        )
      } catch (error) {
        this.clearSession()
        throw error
      }
    },
    async logout(): Promise<{ remoteSucceeded: boolean }> {
      let remoteSucceeded = true
      try {
        if (this.token) await authApi.logout()
      } catch {
        remoteSucceeded = false
      } finally {
        this.clearSession()
      }
      return { remoteSucceeded }
    },
    clearSession(): void {
      this.generation += 1
      this.token = null
      this.profile = null
      this.expiresAt = null
      this.sessionStatus = 'anonymous'
      this.sessionValidationMessage = ''
      sessionStorage.removeItem(SESSION_KEY)
      clearTenantCaches()
    },
    switchTenant(tenantCode: string): void {
      if (this.profile?.tenantCode !== tenantCode) this.clearSession()
    },
  },
})
