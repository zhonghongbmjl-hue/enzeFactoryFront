import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shipmentApi } from '@/api/shipment'
import { salesOrderApi } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import type { AfterSalesCase, ExceptionCase } from '@/types/shipment'
import AfterSalesInboxView from './AfterSalesInboxView.vue'

vi.mock('@/api/shipment', () => ({
  shipmentApi: {
    listAfterSales: vi.fn(),
    listExceptionCases: vi.fn(),
    openExceptionCase: vi.fn(),
    resolveExceptionCase: vi.fn(),
  },
}))

vi.mock('@/api/orders', () => ({
  salesOrderApi: { list: vi.fn() },
}))

function selectField(wrapper: ReturnType<typeof mount>, testId: string) {
  const field = wrapper
    .findAllComponents({ name: 'SelectField' })
    .find((item) => item.props('dataTestid') === testId)
  if (!field) throw new Error(`SelectField [data-testid="${testId}"] not found`)
  return field
}

const TENANT = '55555555-5555-4555-8555-555555555555'
const USER = '66666666-6666-4666-8666-666666666666'
const ORDER = '11111111-1111-4111-8111-111111111111'
const CASE = '44444444-4444-4444-8444-444444444444'
const EXCEPTION = '77777777-7777-4777-8777-777777777777'

function afterSales(customerFeedback: string): AfterSalesCase {
  return {
    id: CASE,
    salesOrderId: ORDER,
    orderItemId: 'order-item-1',
    skuId: 'sku-1',
    productionBatchId: 'batch-1',
    workOrderId: 'work-order-1',
    originalPackingOrderId: 'packing-1',
    originalPackingItemId: 'packing-item-1',
    originalShipmentId: 'shipment-1',
    quantity: '1.000000',
    reasonCode: 'SEAM_OPEN',
    customerFeedback,
    returnCarrier: null,
    returnTrackingNo: null,
    status: 'CREATED',
    returnInTransitAt: null,
    receivedAt: null,
    signedAt: null,
    completedAt: null,
    reworkRecordId: null,
    afterSalesInspectionId: null,
    repackingOrderId: null,
    reshipmentId: null,
    reconciliationIssueId: null,
    version: 0,
  }
}

const exceptionCase: ExceptionCase = {
  id: EXCEPTION,
  salesOrderId: ORDER,
  category: 'CUSTOMER_CLAIM',
  legacySourceType: null,
  legacySourceId: null,
  referenceNo: 'CLAIM-101',
  description: '客户索赔待结算',
  affectedQuantity: '1.000000',
  status: 'OPEN',
  resolutionCode: null,
  resolutionEvidenceType: null,
  resolutionEvidenceRef: null,
  openedAt: '2026-08-25T03:00:00Z',
  resolvedAt: null,
  version: 0,
}

describe('全租户售后待办工作台', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    sessionStorage.clear()
    vi.clearAllMocks()
    const auth = useAuthStore()
    auth.generation = 1
    auth.profile = {
      userId: USER,
      username: 'after-sales-manager',
      displayName: '售后主管',
      tenantId: TENANT,
      tenantCode: 'factory-a',
      roles: ['AFTER_SALES'],
      permissions: ['AFTER_SALES_MANAGE'],
    }
    vi.mocked(shipmentApi.listAfterSales).mockImplementation(async ({ page }) =>
      page === 0
        ? {
            items: [afterSales('第0条客户反馈')],
            page: 0,
            size: 100,
            total: 101,
            hasNext: true,
            hasPrevious: false,
          }
        : {
            items: [afterSales('第100条客户反馈')],
            page: 1,
            size: 100,
            total: 101,
            hasNext: false,
            hasPrevious: true,
          },
    )
    vi.mocked(shipmentApi.listExceptionCases).mockResolvedValue({
      items: [exceptionCase],
      page: 0,
      size: 20,
      total: 1,
      hasNext: false,
      hasPrevious: false,
    })
    vi.mocked(salesOrderApi.list).mockResolvedValue({
      content: [
        {
          id: ORDER,
          orderNo: 'SO-101',
          customerName: '测试客户',
          status: 'AFTER_SALES_OBSERVATION',
        },
      ],
      totalElements: 1,
      totalPages: 1,
      page: 0,
      size: 100,
    } as never)
  })

  async function render() {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/after-sales', component: AfterSalesInboxView },
        { path: '/after-sales/:caseId', component: { template: '<div />' } },
      ],
    })
    await router.push('/after-sales')
    await router.isReady()
    const wrapper = mount(AfterSalesInboxView, { global: { plugins: [router] } })
    await flushPromises()
    return wrapper
  }

  it('uses real pagination so the one-hundred-and-first case remains reachable', async () => {
    const wrapper = await render()
    expect(wrapper.text()).toContain('第0条客户反馈')
    expect(wrapper.text()).toContain('共 101 条')
    await wrapper.get('[data-testid="after-sales-next-page"]').trigger('click')
    await flushPromises()
    expect(shipmentApi.listAfterSales).toHaveBeenLastCalledWith({ page: 1, size: 100 })
    expect(wrapper.text()).toContain('第100条客户反馈')
  })

  it('lists, creates and resolves authoritative exception cases', async () => {
    vi.mocked(shipmentApi.openExceptionCase).mockResolvedValue(exceptionCase)
    vi.mocked(shipmentApi.resolveExceptionCase).mockResolvedValue({
      ...exceptionCase,
      status: 'RESOLVED',
      version: 1,
    })
    const wrapper = await render()
    expect(wrapper.text()).toContain('CLAIM-101')
    selectField(wrapper, 'exception-order-id').vm.$emit('update:modelValue', ORDER)
    await wrapper.get('[data-testid="exception-reference"]').setValue('CLAIM-102')
    await wrapper.get('[data-testid="exception-description"]').setValue('索赔待结算')
    await wrapper.get('[data-testid="exception-quantity"]').setValue('1.000000')
    await wrapper.get('[data-testid="exception-open-form"]').trigger('submit')
    await flushPromises()
    expect(shipmentApi.openExceptionCase).toHaveBeenCalledWith(
      expect.objectContaining({ salesOrderId: ORDER, referenceNo: 'CLAIM-102' }),
      expect.any(String),
    )

    await wrapper.get(`[data-testid="evidence-${EXCEPTION}"]`).setValue('SETTLEMENT-101')
    await wrapper.get(`[data-testid="resolve-${EXCEPTION}"]`).trigger('click')
    await flushPromises()
    expect(shipmentApi.resolveExceptionCase).toHaveBeenCalledWith(
      EXCEPTION,
      expect.objectContaining({ expectedVersion: 0 }),
      expect.any(String),
    )
  })

  it('pages authoritative exception cases so the twenty-first item remains reachable', async () => {
    vi.mocked(shipmentApi.listExceptionCases).mockImplementation(async ({ page }) =>
      page === 0
        ? {
            items: [{ ...exceptionCase, referenceNo: 'CLAIM-001' }],
            page: 0,
            size: 20,
            total: 21,
            hasNext: true,
            hasPrevious: false,
          }
        : {
            items: [
              {
                ...exceptionCase,
                id: '88888888-8888-4888-8888-888888888888',
                referenceNo: 'CLAIM-021',
              },
            ],
            page: 1,
            size: 20,
            total: 21,
            hasNext: false,
            hasPrevious: true,
          },
    )
    const wrapper = await render()
    expect(wrapper.text()).toContain('CLAIM-001')
    await wrapper.get('[data-testid="exception-next-page"]').trigger('click')
    await flushPromises()
    expect(shipmentApi.listExceptionCases).toHaveBeenLastCalledWith({
      status: 'OPEN',
      page: 1,
      size: 20,
    })
    expect(wrapper.text()).toContain('CLAIM-021')
  })
})
