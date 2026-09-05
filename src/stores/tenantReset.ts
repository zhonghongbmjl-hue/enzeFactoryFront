import { getActivePinia, type Store } from 'pinia'
import { registerTenantCache } from './tenantCache'

export function bindStoreToTenant(useStore: () => Store): void {
  registerTenantCache(() => {
    if (!getActivePinia()) return
    useStore().$reset()
  })
}
