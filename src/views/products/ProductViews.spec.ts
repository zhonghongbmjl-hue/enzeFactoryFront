import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProductListView from './ProductListView.vue'
import ProductDetailView from './ProductDetailView.vue'
import BomEditorView from './BomEditorView.vue'
import { useAuthStore } from '@/stores/auth'
import { bomApi, productApi } from '@/api/products'
import { masterDataApi } from '@/api/masterdata'

vi.mock('@/api/masterdata', () => ({ masterDataApi: { select: vi.fn().mockResolvedValue([]) } }))

vi.mock('@/api/products', () => ({
  productApi: {
    list: vi
      .fn()
      .mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }),
    get: vi.fn().mockResolvedValue({
      id: 'product-id',
      styleNo: 'STYLE-1',
      name: '纸样款',
      status: 'DRAFT',
      version: 0,
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
    }),
    create: vi.fn(),
    update: vi.fn(),
    action: vi.fn(),
    skus: vi.fn().mockResolvedValue([]),
    createSku: vi.fn(),
    updateSku: vi.fn(),
    setSkuStatus: vi.fn(),
  },
  bomApi: {
    get: vi.fn().mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      productId: '22222222-2222-2222-2222-222222222222',
      versionNo: 'V1',
      name: '测试BOM',
      status: 'PENDING_APPROVAL',
      version: 1,
      createdAt: '2026-08-23T00:00:00Z',
      updatedAt: '2026-08-23T00:00:00Z',
      items: [],
    }),
    update: vi.fn(),
    submit: vi.fn(),
    approve: vi.fn(),
    activate: vi.fn(),
    retire: vi.fn(),
    list: vi
      .fn()
      .mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 }),
    create: vi.fn(),
  },
}))

describe('产品与BOM页面权限', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  function permissions(values: string[]): void {
    const auth = useAuthStore()
    auth.profile = {
      userId: '11111111-1111-4111-8111-111111111111',
      username: 'tester',
      displayName: '测试员',
      tenantId: '22222222-2222-4222-8222-222222222222',
      tenantCode: 'test',
      roles: ['TEST'],
      permissions: values,
    }
  }

  it('仅查看用户看不到产品写动作', async () => {
    permissions(['PRODUCT_VIEW'])
    const wrapper = mount(ProductListView, { global: { stubs: { RouterLink: true } } })
    await Promise.resolve()
    expect(wrapper.text()).toContain('产品纸样台账')
    expect(wrapper.find('[data-testid="create-product"]').exists()).toBe(false)
  })

  it('BOM编辑器展示用量损耗并按审核权限显示动作', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_APPROVE'])
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const wrapper = mount(BomEditorView, {
      props: { bomId: '11111111-1111-1111-1111-111111111111' },
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('单件用量')
    expect(wrapper.text()).toContain('损耗率')
    expect(wrapper.find('[data-testid="approve-bom"]').exists()).toBe(true)
  })

  it('SKU矩阵保留相同颜色尺码的不同版型并提供草稿维护入口', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_MANAGE'])
    vi.mocked(productApi.skus).mockResolvedValueOnce([
      {
        id: 'sku-1',
        productId: 'product-id',
        skuCode: 'REG-M',
        color: '黑',
        colorCode: 'BK',
        size: 'M',
        fit: 'REGULAR',
        active: true,
        version: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'sku-2',
        productId: 'product-id',
        skuCode: 'SLIM-M',
        color: '黑',
        colorCode: 'BK',
        size: 'M',
        fit: 'SLIM',
        active: true,
        version: 0,
        createdAt: '',
        updatedAt: '',
      },
    ])
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products/:id', name: 'product-detail', component: ProductDetailView }],
    })
    await router.push('/products/product-id')
    await router.isReady()
    const wrapper = mount(ProductDetailView, {
      global: { plugins: [router], stubs: { RouterLink: true, ElDrawer: true } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('REG-M')
    expect(wrapper.text()).toContain('SLIM-M')
    expect(wrapper.text()).toContain('版型 REGULAR')
    expect(wrapper.text()).toContain('版型 SLIM')
    expect(wrapper.find('[data-testid="edit-product"]').exists()).toBe(true)
  })

  it('BOM动作冲突展示错误和追踪号，ACTIVE版本提供退役动作', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_APPROVE'])
    vi.mocked(bomApi.approve).mockRejectedValueOnce({ message: '版本冲突', traceId: 'trace-409' })
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const wrapper = mount(BomEditorView, {
      props: { bomId: '11111111-1111-1111-1111-111111111111' },
      global: { plugins: [router] },
    })
    await flushPromises()
    await wrapper.get('[data-testid="approve-bom"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('版本冲突')
    expect(wrapper.text()).toContain('trace-409')

    vi.mocked(bomApi.get).mockResolvedValueOnce({
      id: 'active-bom',
      productId: 'product-id',
      versionNo: 'V1',
      name: '生效BOM',
      status: 'ACTIVE',
      version: 4,
      createdAt: '',
      updatedAt: '',
      items: [],
    })
    const active = mount(BomEditorView, {
      props: { bomId: 'active-bom' },
      global: { plugins: [router] },
    })
    await flushPromises()
    expect(active.find('[data-testid="retire-bom"]').exists()).toBe(true)
  })

  it('产品已加载时状态冲突仍展示消息和追踪号', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_MANAGE'])
    vi.mocked(productApi.get).mockResolvedValueOnce({
      id: 'product-id',
      styleNo: 'STYLE-1',
      name: '纸样款',
      status: 'ACTIVE',
      version: 3,
      createdAt: '',
      updatedAt: '',
    })
    vi.mocked(productApi.action).mockRejectedValueOnce({
      message: '请先处理生效BOM',
      traceId: 'trace-product-409',
    })
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/products/:id', component: ProductDetailView }],
    })
    await router.push('/products/product-id')
    await router.isReady()
    const wrapper = mount(ProductDetailView, {
      global: { plugins: [router], stubs: { RouterLink: true } },
    })
    await flushPromises()
    await wrapper.get('button').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('请先处理生效BOM')
    expect(wrapper.text()).toContain('trace-product-409')
  })

  it('物料搜索仅采用最后一次响应且动作pending阻止重复提交', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_MANAGE'])
    type MaterialOptions = Awaited<ReturnType<typeof masterDataApi.select>>
    let resolveOld!: (value: MaterialOptions) => void
    let resolveLatest!: (value: MaterialOptions) => void
    vi.mocked(masterDataApi.select)
      .mockReturnValueOnce(new Promise((resolve) => (resolveOld = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (resolveLatest = resolve)))
    vi.mocked(bomApi.get).mockResolvedValueOnce({
      id: 'draft-bom',
      productId: 'product-id',
      versionNo: 'V2',
      name: '草稿',
      status: 'DRAFT',
      version: 0,
      createdAt: '',
      updatedAt: '',
      items: [],
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const wrapper = mount(BomEditorView, {
      props: { bomId: 'draft-bom' },
      global: { plugins: [router] },
    })
    await flushPromises()
    const input = wrapper.get('input[placeholder="编码 / 名称"]')
    await input.setValue('OLD')
    await input.trigger('keyup.enter')
    await input.setValue('LATEST')
    await input.trigger('keyup.enter')
    resolveLatest([{ id: 'latest', code: 'LATEST', name: '最新面料', active: true }])
    await flushPromises()
    resolveOld([])
    await flushPromises()
    await wrapper.get('button.table-action').trigger('click')
    expect(wrapper.text()).toContain('LATEST')
  })

  it('未检索物料时添加物料仍会插入空行', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_MANAGE'])
    vi.mocked(bomApi.get).mockResolvedValueOnce({
      id: 'draft-bom',
      productId: 'product-id',
      versionNo: 'V2',
      name: '草稿',
      status: 'DRAFT',
      version: 0,
      createdAt: '',
      updatedAt: '',
      items: [],
    })
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const wrapper = mount(BomEditorView, {
      props: { bomId: 'draft-bom' },
      global: { plugins: [router] },
    })
    await flushPromises()
    expect(wrapper.find('[aria-label="单件用量"]').exists()).toBe(false)
    await wrapper.get('button.table-action').trigger('click')
    expect(wrapper.find('[aria-label="单件用量"]').exists()).toBe(true)
  })

  it('生命周期动作pending时禁用按钮并忽略双击', async () => {
    permissions(['PRODUCT_VIEW', 'PRODUCT_APPROVE'])
    let resolve!: (value: Awaited<ReturnType<typeof bomApi.approve>>) => void
    vi.mocked(bomApi.approve).mockReturnValueOnce(new Promise((done) => (resolve = done)))
    const router = createRouter({ history: createMemoryHistory(), routes: [] })
    const wrapper = mount(BomEditorView, {
      props: { bomId: 'pending-bom' },
      global: { plugins: [router] },
    })
    await flushPromises()
    const button = wrapper.get('[data-testid="approve-bom"]')
    await button.trigger('click')
    await button.trigger('click')
    expect(vi.mocked(bomApi.approve)).toHaveBeenCalledTimes(1)
    expect(button.attributes('disabled')).toBeDefined()
    resolve({
      id: 'pending-bom',
      productId: 'product-id',
      versionNo: 'V1',
      name: '待审核BOM',
      status: 'APPROVED',
      version: 2,
      createdAt: '',
      updatedAt: '',
      items: [],
    })
    await flushPromises()
  })
})
