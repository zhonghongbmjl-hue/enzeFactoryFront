import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { dashboardApi } from '@/api/dashboard'
import { CONTROL_TOWER_PAGE_SIZE, useDashboardStore } from './dashboard'

vi.mock('@/api/dashboard', () => ({
  dashboardApi: { orderControlTower: vi.fn() },
}))

const page = {
  content: [],
  totalElements: 22,
  totalPages: 2,
  page: 1,
  size: CONTROL_TOWER_PAGE_SIZE,
}

describe('dashboard store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.mocked(dashboardApi.orderControlTower).mockResolvedValue(page)
  })

  it('loads a target page and records the server page number', async () => {
    const dashboard = useDashboardStore()
    await dashboard.load(1)
    expect(dashboardApi.orderControlTower).toHaveBeenCalledWith({
      page: 1,
      size: CONTROL_TOWER_PAGE_SIZE,
    })
    expect(dashboard.page).toBe(1)
    expect(dashboard.result?.totalElements).toBe(22)
  })

  it('does not start a second request while loading', async () => {
    let resolveFirst!: (value: typeof page) => void
    vi.mocked(dashboardApi.orderControlTower).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve
      }),
    )
    const dashboard = useDashboardStore()
    const first = dashboard.load(0)
    await dashboard.load(1)
    resolveFirst(page)
    await first
    expect(dashboardApi.orderControlTower).toHaveBeenCalledOnce()
  })

  it('keeps the previous page when a refresh fails', async () => {
    const dashboard = useDashboardStore()
    await dashboard.load(1)
    vi.mocked(dashboardApi.orderControlTower).mockRejectedValueOnce({
      message: '控制塔暂时不可用',
      traceId: 'trace-dashboard',
    })
    await dashboard.load(1)
    expect(dashboard.failure).toBe('控制塔暂时不可用')
    expect(dashboard.traceId).toBe('trace-dashboard')
    expect(dashboard.page).toBe(1)
  })
})
