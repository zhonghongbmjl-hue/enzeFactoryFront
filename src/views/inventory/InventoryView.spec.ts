import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '@/api/inventory'
import { masterDataApi } from '@/api/masterdata'
import { salesOrderApi } from '@/api/orders'
import type { MasterDataRecord } from '@/types/masterdata'
import type { SalesOrder } from '@/types/order'
import InventoryView from './InventoryView.vue'

vi.mock('@/api/inventory', () => ({
  inventoryApi: { balances: vi.fn(), ledgers: vi.fn(), issue: vi.fn(), returnMaterial: vi.fn() },
}))

vi.mock('@/api/masterdata', () => ({
  masterDataApi: { list: vi.fn(), select: vi.fn() },
}))

vi.mock('@/api/orders', () => ({
  salesOrderApi: { list: vi.fn() },
}))

const SelectFieldStub = {
  name: 'SelectField',
  props: ['modelValue', 'options', 'id', 'name', 'dataTestid', 'disabled'],
  emits: ['update:modelValue', 'change'],
  template: `<select
    :id="id"
    :name="name"
    :data-testid="dataTestid"
    :value="modelValue"
    :disabled="disabled"
    @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"
  ><option value=""></option><option v-for="item in options" :key="String(item.value)" :value="item.value">{{ item.label }}</option></select>`,
}

function material(
  partial: Partial<MasterDataRecord> & Pick<MasterDataRecord, 'id' | 'name'>,
): MasterDataRecord {
  return {
    code: partial.code ?? partial.id,
    active: true,
    version: 1,
    createdAt: '',
    updatedAt: '',
    materialType: 'FABRIC',
    ...partial,
  }
}

describe('库存与领退料工作台', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(masterDataApi.list).mockResolvedValue({
      content: [
        material({ id: 'material-id', code: 'FAB-001', name: '精纺羊毛' }),
        material({
          id: 'accessory-id',
          code: 'ACC-001',
          name: '拉链',
          materialType: 'ACCESSORY',
        }),
      ],
      totalElements: 2,
      totalPages: 1,
      number: 0,
      size: 100,
    })
    vi.mocked(masterDataApi.select).mockResolvedValue([
      { id: 'warehouse-id', code: 'WH-01', name: '主仓' },
    ])
    vi.mocked(salesOrderApi.list).mockResolvedValue({
      content: [
        {
          id: 'order-id',
          orderNo: 'PO-001',
          status: 'MATERIAL_PREPARING',
          items: [{ id: 'order-item-id', color: '藏青', size: 'M', fit: 'REGULAR' }],
        } as SalesOrder,
        {
          id: 'draft-order-id',
          orderNo: 'PO-DRAFT',
          status: 'DRAFT',
          items: [{ id: 'draft-item-id', color: '米白', size: 'S', fit: 'SLIM' }],
        } as SalesOrder,
      ],
      totalElements: 2,
      totalPages: 1,
      page: 0,
      size: 50,
    })
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

  it('按面料名称选择并显示批次库存与可用量公式', async () => {
    const wrapper = mount(InventoryView, {
      global: { stubs: { SelectField: SelectFieldStub } },
    })
    await flushPromises()

    expect(masterDataApi.list).toHaveBeenCalledWith('materials', {
      page: 0,
      size: 100,
      active: true,
      sort: 'name,asc',
    })
    expect(wrapper.text()).toContain('面料名称')
    expect(wrapper.get('[data-testid="material-query"]').text()).toContain('精纺羊毛')
    expect(wrapper.get('[data-testid="material-query"]').text()).not.toContain('拉链')

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

  it('领料出库用下拉选择订单项、仓库和面料', async () => {
    const wrapper = mount(InventoryView, {
      global: { stubs: { SelectField: SelectFieldStub } },
    })
    await flushPromises()

    expect(masterDataApi.select).toHaveBeenCalledWith('warehouses', '', 50)
    expect(salesOrderApi.list).toHaveBeenCalledWith({ page: 0, size: 50 })
    expect(wrapper.get('[data-testid="issue-order-item"]').text()).toContain(
      'PO-001 · 藏青 / M / REGULAR',
    )
    expect(wrapper.get('[data-testid="issue-order-item"]').text()).not.toContain('PO-DRAFT')
    expect(wrapper.get('[data-testid="issue-warehouse"]').text()).toContain('WH-01 · 主仓')
    expect(wrapper.get('[data-testid="issue-material"]').text()).toContain('精纺羊毛')
    expect(wrapper.get('[data-testid="issue-material"]').text()).not.toContain('拉链')
  })
})
