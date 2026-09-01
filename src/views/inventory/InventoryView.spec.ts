import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '@/api/inventory'
import InventoryView from './InventoryView.vue'

vi.mock('@/api/inventory', () => ({
  inventoryApi: { balances: vi.fn(), ledgers: vi.fn(), issue: vi.fn(), returnMaterial: vi.fn() },
}))

describe('库存与领退料工作台', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(inventoryApi.balances).mockResolvedValue([
      {
        id: 'balance-id',
        warehouseId: 'warehouse-id',
        materialId: 'material-id',
        batchNo: 'LOT-001',
        onHand: '100.000000',
        reserved: '25.000000',
        available: '75.000000',
        version: 3,
      },
    ])
    vi.mocked(inventoryApi.ledgers).mockResolvedValue([])
  })

  it('按物料显示批次库存并明确可用量公式', async () => {
    const wrapper = mount(InventoryView)
    await wrapper.get('[data-testid="material-query"]').setValue('material-id')
    await wrapper.get('[data-testid="load-inventory"]').trigger('click')
    await flushPromises()

    expect(inventoryApi.balances).toHaveBeenCalledWith('material-id')
    expect(wrapper.text()).toContain('可用量 = 现存量 − 预占量')
    expect(wrapper.text()).toContain('LOT-001')
    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).toContain('25')
    expect(wrapper.get('[data-testid="available-quantity"]').text()).toContain('75')
  })
})
