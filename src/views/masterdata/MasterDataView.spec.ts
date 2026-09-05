import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import MasterDataView from './MasterDataView.vue'

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  select: vi.fn(),
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
vi.mock('@/api/masterdata', () => ({
  masterDataApi: api,
}))

function tabs(wrapper: VueWrapper) {
  return wrapper.findAll('[role="tab"]')
}

function selectField(wrapper: VueWrapper, id: string) {
  const field = wrapper
    .findAllComponents({ name: 'SelectField' })
    .find((item) => item.props('id') === id)
  if (!field) throw new Error(`SelectField #${id} not found`)
  return field
}

async function chooseSelectField(wrapper: VueWrapper, id: string, value: string) {
  const field = selectField(wrapper, id)
  field.vm.$emit('update:modelValue', value)
  field.vm.$emit('change', value)
  await wrapper.vm.$nextTick()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('MasterDataView', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset())
    api.list.mockResolvedValue({
      content: [],
      totalElements: 0,
      totalPages: 0,
      number: 0,
      size: 20,
    })
    api.select.mockResolvedValue([])
    api.create.mockResolvedValue({})
  })

  function mountView(manage = true) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.profile = {
      userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
      username: 'master',
      displayName: '资料员',
      tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
      tenantCode: 'needle-one',
      roles: ['MASTER'],
      permissions: manage ? ['MASTERDATA_VIEW', 'MASTERDATA_MANAGE'] : ['MASTERDATA_VIEW'],
    }
    return mount(MasterDataView, {
      global: {
        plugins: [pinia],
        stubs: { teleport: true, 'el-pagination': true, SelectField: SelectFieldStub },
      },
    })
  }

  it('uses server paging and shows the trace id on failure', async () => {
    api.list.mockRejectedValueOnce({ message: '字段错误', traceId: 'trace-md-42' })
    const wrapper = mountView()
    await vi.waitFor(() => expect(wrapper.text()).toContain('trace-md-42'))
    expect(wrapper.text()).toContain('字段错误')
  })

  it('has an accessible create action and status filter', async () => {
    const wrapper = mountView()
    await vi.waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(wrapper.find('button[aria-label="新建基础资料"]').exists()).toBe(true)
    expect(wrapper.find('[aria-label="状态筛选"]').exists()).toBe(true)
  })

  it('ignores an older category response that resolves after the current category', async () => {
    const oldOrganizations = deferred<object>()
    const currentFactories = deferred<object>()
    api.list
      .mockReset()
      .mockReturnValueOnce(oldOrganizations.promise)
      .mockReturnValueOnce(currentFactories.promise)
    const wrapper = mountView()
    await tabs(wrapper)[1]!.trigger('click')
    currentFactories.resolve({
      content: [
        {
          id: 'f-1',
          code: 'F1',
          name: '当前工厂',
          active: true,
          version: 0,
          updatedAt: '2026-08-23T00:00:00Z',
        },
      ],
      totalElements: 1,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('当前工厂')

    oldOrganizations.resolve({
      content: [
        {
          id: 'o-1',
          code: 'O1',
          name: '过期组织',
          active: true,
          version: 0,
          updatedAt: '2026-08-23T00:00:00Z',
        },
      ],
      totalElements: 1,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('当前工厂')
    expect(wrapper.text()).not.toContain('过期组织')
  })

  it('keeps loading while a newer category request remains pending', async () => {
    const older = deferred<object>()
    const newer = deferred<object>()
    api.list.mockReset().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise)
    const wrapper = mountView()
    await tabs(wrapper)[1]!.trigger('click')
    older.resolve({ content: [], totalElements: 0 })
    await flushPromises()
    expect(wrapper.get('.master-table-wrap').attributes('aria-busy')).toBe('true')
    newer.resolve({ content: [], totalElements: 0 })
    await flushPromises()
    expect(wrapper.get('.master-table-wrap').attributes('aria-busy')).toBe('false')
  })

  it('keeps a view-only operator read-only even when the action is invoked programmatically', async () => {
    const wrapper = mountView(false)
    await vi.waitFor(() => expect(api.list).toHaveBeenCalled())
    expect(wrapper.find('button[aria-label="新建基础资料"]').exists()).toBe(false)
    const exposed = wrapper.vm as unknown as {
      openCreate: () => Promise<void>
      openEdit: (row: object) => Promise<void>
      save: () => Promise<void>
      toggle: (row: object) => Promise<void>
    }
    const row = { id: 'org-1', code: 'ORG', name: '总部', active: true, version: 0 }
    await exposed.openCreate()
    await exposed.openEdit(row)
    await exposed.save()
    await exposed.toggle(row)
    expect(api.select).not.toHaveBeenCalled()
    expect(api.create).not.toHaveBeenCalled()
    expect(api.update).not.toHaveBeenCalled()
    expect(api.setStatus).not.toHaveBeenCalled()
    expect(wrapper.find('#md-code').exists()).toBe(false)
  })

  it('loads factories for the selected warehouse organization and sends both owner ids', async () => {
    api.select.mockImplementation(
      async (type: string, _query: string, _limit: number, filters?: object) => {
        if (type === 'organizations')
          return [
            { id: 'org-1', code: 'ORG', name: '总部' },
            { id: 'org-2', code: 'ORG2', name: '分部' },
          ]
        if (type === 'factories' && filters && filters.organizationId === 'org-1') {
          return [{ id: 'factory-1', code: 'F1', name: '一厂' }]
        }
        return []
      },
    )
    const wrapper = mountView()
    await tabs(wrapper)[4]!.trigger('click')
    await wrapper.get('button[aria-label="新建基础资料"]').trigger('click')
    await vi.waitFor(() => expect(api.select).toHaveBeenCalledWith('organizations', '', 30))
    await chooseSelectField(wrapper, 'md-organization', 'org-1')
    await vi.waitFor(() =>
      expect(api.select).toHaveBeenCalledWith('factories', '', 30, { organizationId: 'org-1' }),
    )
    await chooseSelectField(wrapper, 'md-factory', 'factory-1')
    await chooseSelectField(wrapper, 'md-organization', 'org-2')
    await vi.waitFor(() =>
      expect(api.select).toHaveBeenCalledWith('factories', '', 30, { organizationId: 'org-2' }),
    )
    expect(selectField(wrapper, 'md-factory').props('modelValue')).toBe('')
    await chooseSelectField(wrapper, 'md-organization', 'org-1')
    await chooseSelectField(wrapper, 'md-factory', 'factory-1')
    await wrapper.get('#md-code').setValue('WH1')
    await wrapper.get('#md-name').setValue('主仓')
    await wrapper.get('.master-form').trigger('submit')
    await vi.waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        'warehouses',
        expect.objectContaining({ organizationId: 'org-1', factoryId: 'factory-1' }),
      ),
    )
  })

  it('does not let an old organization factory response replace the current options', async () => {
    const oldFactories = deferred<object[]>()
    const currentFactories = deferred<object[]>()
    api.select.mockImplementation(
      async (
        type: string,
        _query: string,
        _limit: number,
        filters?: { organizationId?: string },
      ) => {
        if (type === 'organizations')
          return [
            { id: 'org-1', code: 'O1', name: '旧组织' },
            { id: 'org-2', code: 'O2', name: '当前组织' },
          ]
        if (filters?.organizationId === 'org-1') return oldFactories.promise
        if (filters?.organizationId === 'org-2') return currentFactories.promise
        return []
      },
    )
    const wrapper = mountView()
    await tabs(wrapper)[4]!.trigger('click')
    await wrapper.get('button[aria-label="新建基础资料"]').trigger('click')
    await chooseSelectField(wrapper, 'md-organization', 'org-1')
    await chooseSelectField(wrapper, 'md-organization', 'org-2')
    currentFactories.resolve([{ id: 'f-2', code: 'F2', name: '当前工厂' }])
    await flushPromises()
    oldFactories.resolve([{ id: 'f-1', code: 'F1', name: '过期工厂' }])
    await flushPromises()
    expect(wrapper.get('#md-factory').text()).toContain('当前工厂')
    expect(wrapper.get('#md-factory').text()).not.toContain('过期工厂')
  })
})
