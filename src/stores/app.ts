import { defineStore } from 'pinia'
import { bindStoreToTenant } from './tenantReset'

export const DESKTOP_BREAKPOINT = 1200

export const useAppStore = defineStore('app', {
  state: () => ({
    isDesktop: false,
    navigationOpen: false,
  }),
  actions: {
    syncViewport(): void {
      this.isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT
      if (this.isDesktop) this.navigationOpen = false
    },
    openNavigation(): void {
      this.navigationOpen = true
    },
    closeNavigation(): void {
      this.navigationOpen = false
    },
  },
})

bindStoreToTenant(useAppStore)
