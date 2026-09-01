import type { Router } from 'vue-router'
import type { useAuthStore } from '@/stores/auth'
import { safeReturnTo } from '@/router/safeReturn'

type AuthStore = ReturnType<typeof useAuthStore>

export function createUnauthorizedHandler(
  auth: Pick<AuthStore, 'clearSession' | 'generation'>,
  router: Pick<Router, 'currentRoute' | 'replace'>,
): (requestGeneration: number) => void {
  return (requestGeneration) => {
    if (requestGeneration !== auth.generation) return
    const returnTo = safeReturnTo(router.currentRoute.value.fullPath)
    auth.clearSession()
    void router.replace({
      name: 'login',
      query: returnTo === '/' ? {} : { returnTo },
    })
  }
}
