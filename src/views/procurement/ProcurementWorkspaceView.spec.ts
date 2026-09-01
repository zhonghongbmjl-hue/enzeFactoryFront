import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { procurementApi } from '@/api/procurement'
import { useAuthStore } from '@/stores/auth'
import type { ProcurementWorkspace } from '@/types/procurement'
import ProcurementWorkspaceView from './ProcurementWorkspaceView.vue'

vi.mock('@/api/procurement', () => ({
  procurementApi: { workspace: vi.fn(), planAction: vi.fn() },
}))

const workspace: ProcurementWorkspace = {
  salesOrderId: 'order-id',
  branches: [
    {
      id: 'fabric-plan',
      salesOrderId: 'order-id',
      orderNo: 'PO-20260824-001',
      materialType: 'FABRIC',
      status: 'DRAFT',
      version: 0,
      items: [
        {
          id: 'fabric-line',
          requirementId: 'fabric-requirement',
          orderItemId: 'order-item',
          bomSnapshotId: 'bom-item',
          materialId: 'fabric-id',
          materialType: 'FABRIC',
          materialCode: 'FAB-001',
          materialName: '精纺羊毛',
          uom: 'm',
          plannedQuantity: 120.5,
          orderedQuantity: 100,
          receivedQuantity: 80,
          inspectedQuantity: 60,
          passedQuantity: 58,
          rejectedQuantity: 2,
          putAwayQuantity: 50,
        },
      ],
    },
    {
      id: 'accessory-plan',
      salesOrderId: 'order-id',
      orderNo: 'PO-20260824-001',
      materialType: 'ACCESSORY',
      status: 'ORDERED',
      version: 2,
      items: [
        {
          id: 'accessory-line',
          requirementId: 'accessory-requirement',
          orderItemId: 'order-item',
          bomSnapshotId: 'bom-item-2',
          materialId: 'accessory-id',
          materialType: 'ACCESSORY',
          materialCode: 'ACC-009',
          materialName: '四眼纽扣',
          uom: 'pcs',
          plannedQuantity: 600,
          orderedQuantity: 600,
          receivedQuantity: 600,
          inspectedQuantity: 600,
          passedQuantity: 600,
          rejectedQuantity: 0,
          putAwayQuantity: 600,
        },
      ],
    },
  ],
}

describe('采购与来料工作台', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(procurementApi.workspace).mockResolvedValue(workspace)
  })

  function permissions(values: string[]): void {
    useAuthStore().profile = {
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'buyer',
      displayName: '采购员',
      tenantId: '22222222-2222-4222-8222-222222222222',
      tenantCode: 'test',
      roles: ['BUYER'],
      permissions: values,
    }
  }

  async function render() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/procurement/:orderId', component: ProcurementWorkspaceView }],
    })
    await router.push('/procurement/order-id')
    await router.isReady()
    const wrapper = mount(ProcurementWorkspaceView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('并列展示布料与辅料分支、来源关系和数量进度', async () => {
    permissions(['PROCUREMENT_VIEW'])
    const wrapper = await render()
    expect(wrapper.text()).toContain('布料采购')
    expect(wrapper.text()).toContain('辅料采购')
    expect(wrapper.text()).toContain('FAB-001')
    expect(wrapper.text()).toContain('ACC-009')
    expect(wrapper.text()).toContain('120.5 m')
    expect(wrapper.text()).toContain('600 pcs')
    expect(wrapper.text()).toContain('到货 80')
    expect(wrapper.text()).toContain('合格 58')
    expect(wrapper.text()).toContain('上架 50')
    expect(wrapper.findAll('[data-testid="procurement-branch"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="submit-fabric-plan"]').exists()).toBe(false)
  })

  it('只向管理人员暴露合法动作且 pending 时阻止重复提交', async () => {
    permissions(['PROCUREMENT_VIEW', 'PROCUREMENT_MANAGE'])
    let resolve!: (value: ProcurementWorkspace['branches'][number]) => void
    vi.mocked(procurementApi.planAction).mockReturnValueOnce(
      new Promise((done) => (resolve = done)),
    )
    const wrapper = await render()
    const submit = wrapper.get('[data-testid="submit-fabric-plan"]')
    await submit.trigger('click')
    await submit.trigger('click')
    expect(procurementApi.planAction).toHaveBeenCalledTimes(1)
    expect(submit.attributes('disabled')).toBeDefined()
    resolve({ ...workspace.branches[0]!, status: 'PENDING_APPROVAL', version: 1 })
    await flushPromises()
    expect(wrapper.text()).toContain('待审核')
  })

  it('展示部分下单和闭环阶段，并允许已完全下单的计划发起完成动作', async () => {
    permissions(['PROCUREMENT_VIEW', 'PROCUREMENT_MANAGE'])
    vi.mocked(procurementApi.planAction).mockResolvedValueOnce({
      ...workspace.branches[1]!,
      status: 'COMPLETED',
      version: 3,
    })
    const wrapper = await render()

    expect(wrapper.text()).toContain('采购闭环')
    expect(wrapper.text()).toContain('已下单')
    await wrapper.get('[data-testid="complete-accessory-plan"]').trigger('click')
    expect(procurementApi.planAction).toHaveBeenCalledWith('accessory-plan', 'complete', 2)
    await flushPromises()
    expect(wrapper.text()).toContain('已完成')
  })
})
