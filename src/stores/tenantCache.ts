export type TenantCacheCleaner = () => void

const cleaners = new Set<TenantCacheCleaner>()
const TENANT_STORAGE_PREFIX = 'garment.tenant.'

export function registerTenantCache(cleaner: TenantCacheCleaner): () => void {
  cleaners.add(cleaner)
  return () => cleaners.delete(cleaner)
}

function clearStorageTenantKeys(storage: Storage): void {
  const tenantKeys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith(TENANT_STORAGE_PREFIX)))
  for (const key of tenantKeys) storage.removeItem(key)
}

export function clearTenantCaches(): void {
  for (const cleaner of cleaners) cleaner()
  clearStorageTenantKeys(sessionStorage)
  clearStorageTenantKeys(localStorage)
}
