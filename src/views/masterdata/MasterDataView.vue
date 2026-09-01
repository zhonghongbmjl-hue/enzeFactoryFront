<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { masterDataApi } from '@/api/masterdata'
import { ApiClientError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import type {
  MasterDataInput,
  MasterDataOption,
  MasterDataRecord,
  MasterDataType,
} from '@/types/masterdata'

interface CategoryConfig {
  type: MasterDataType
  label: string
  parent?: MasterDataType
  parentLabel?: string
}

const categories: readonly CategoryConfig[] = [
  { type: 'organizations', label: '组织' },
  { type: 'factories', label: '工厂', parent: 'organizations', parentLabel: '所属组织' },
  { type: 'workshops', label: '车间', parent: 'factories', parentLabel: '所属工厂' },
  { type: 'production-lines', label: '产线', parent: 'workshops', parentLabel: '所属车间' },
  { type: 'warehouses', label: '仓库' },
  { type: 'storage-locations', label: '货位', parent: 'warehouses', parentLabel: '所属仓库' },
  { type: 'units-of-measure', label: '计量单位' },
  { type: 'customers', label: '客户' },
  { type: 'suppliers', label: '供应商' },
  { type: 'materials', label: '物料', parent: 'units-of-measure', parentLabel: '计量单位' },
] as const

const activeType = ref<MasterDataType>('organizations')
const rows = ref<MasterDataRecord[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const size = ref(20)
const query = ref('')
const active = ref<string>('true')
const failure = reactive({ message: '', traceId: '' })
const drawer = ref(false)
const editingId = ref('')
const parentOptions = ref<MasterDataOption[]>([])
const organizationOptions = ref<MasterDataOption[]>([])
const factoryOptions = ref<MasterDataOption[]>([])
const form = reactive<MasterDataInput>({ code: '', name: '' })
const auth = useAuthStore()
let listRequestGeneration = 0
let factoryRequestGeneration = 0

const current = computed(() => categories.find((item) => item.type === activeType.value)!)
const canManage = computed(() => auth.permissions.has('MASTERDATA_MANAGE'))

function resetFailure(): void {
  failure.message = ''
  failure.traceId = ''
}

async function load(): Promise<void> {
  const generation = ++listRequestGeneration
  const requestedType = activeType.value
  loading.value = true
  resetFailure()
  try {
    const params = {
      page: page.value - 1,
      size: size.value,
      sort: 'code,asc',
      ...(active.value === '' ? {} : { active: active.value === 'true' }),
      ...(query.value ? { query: query.value } : {}),
    }
    const result = await masterDataApi.list(requestedType, params)
    if (generation !== listRequestGeneration || activeType.value !== requestedType) return
    rows.value = result.content
    total.value = result.totalElements
  } catch (error) {
    if (generation !== listRequestGeneration || activeType.value !== requestedType) return
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '基础资料加载失败'
    failure.traceId = candidate.traceId || ''
  } finally {
    if (generation === listRequestGeneration) loading.value = false
  }
}

async function loadParents(search = ''): Promise<void> {
  if (!current.value.parent) return
  parentOptions.value = await masterDataApi.select(current.value.parent, search, 30)
}

async function loadWarehouseOwners(): Promise<void> {
  organizationOptions.value = await masterDataApi.select('organizations', '', 30)
  await loadFactoriesForOrganization(form.organizationId, false)
}

async function onWarehouseOrganizationChange(): Promise<void> {
  await loadFactoriesForOrganization(form.organizationId, true)
}

async function loadFactoriesForOrganization(
  organizationId: string | undefined,
  clearSelection: boolean,
): Promise<void> {
  const generation = ++factoryRequestGeneration
  if (clearSelection) delete form.factoryId
  factoryOptions.value = []
  if (!organizationId) return
  try {
    const options = await masterDataApi.select('factories', '', 30, { organizationId })
    if (generation !== factoryRequestGeneration || form.organizationId !== organizationId) return
    factoryOptions.value = options
    if (form.factoryId && !options.some((item) => item.id === form.factoryId)) {
      delete form.factoryId
    }
  } catch (error) {
    if (generation !== factoryRequestGeneration || form.organizationId !== organizationId) return
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '工厂选项加载失败'
    failure.traceId = candidate.traceId || ''
  }
}

async function changeCategory(type: MasterDataType): Promise<void> {
  activeType.value = type
  page.value = 1
  await load()
}

function clearForm(): void {
  Object.keys(form).forEach((key) => delete form[key as keyof MasterDataInput])
  form.code = ''
  form.name = ''
  editingId.value = ''
}

async function openCreate(): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('当前账号仅可查看基础资料')
    return
  }
  clearForm()
  drawer.value = true
  if (activeType.value === 'warehouses') await loadWarehouseOwners()
  else await loadParents()
}

async function openEdit(row: MasterDataRecord): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('当前账号仅可查看基础资料')
    return
  }
  clearForm()
  Object.assign(form, row)
  editingId.value = row.id
  if (activeType.value === 'materials' && row.uomId) form.parentId = row.uomId
  drawer.value = true
  if (activeType.value === 'warehouses') await loadWarehouseOwners()
  else await loadParents()
}

async function save(): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('当前账号仅可查看基础资料')
    return
  }
  resetFailure()
  const payload: MasterDataInput = {
    code: form.code.trim().toUpperCase(),
    name: form.name.trim(),
  }
  if (editingId.value && form.version !== undefined) payload.version = form.version
  if (
    form.parentId &&
    ['factories', 'workshops', 'production-lines', 'storage-locations'].includes(activeType.value)
  )
    payload.parentId = form.parentId
  if (activeType.value === 'warehouses') {
    if (form.organizationId) payload.organizationId = form.organizationId
    if (form.factoryId) payload.factoryId = form.factoryId
  }
  if (activeType.value === 'units-of-measure') {
    if (form.symbol) payload.symbol = form.symbol
    if (form.category) payload.category = form.category
    if (form.decimalScale !== undefined) payload.decimalScale = form.decimalScale
  }
  if (activeType.value === 'customers' || activeType.value === 'suppliers') {
    Object.assign(payload, {
      contactName: form.contactName,
      phone: form.phone,
      email: form.email,
      address: form.address,
    })
  }
  if (activeType.value === 'materials') {
    Object.assign(payload, {
      materialType: form.materialType,
      uomId: form.parentId,
      specification: form.specification,
      color: form.color,
      colorCode: form.colorCode,
    })
  }
  try {
    if (editingId.value) await masterDataApi.update(activeType.value, editingId.value, payload)
    else await masterDataApi.create(activeType.value, payload)
    drawer.value = false
    ElMessage.success(editingId.value ? '基础资料已更新' : '基础资料已创建')
    await load()
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '保存失败，请检查字段'
    failure.traceId = candidate.traceId || ''
  }
}

async function toggle(row: MasterDataRecord): Promise<void> {
  if (!canManage.value) {
    ElMessage.warning('当前账号仅可查看基础资料')
    return
  }
  try {
    await masterDataApi.setStatus(activeType.value, row, !row.active)
    await load()
  } catch (error) {
    const candidate = error as Partial<ApiClientError>
    failure.message = candidate.message || '状态更新失败'
    failure.traceId = candidate.traceId || ''
  }
}

watch([active, size], () => {
  page.value = 1
  void load()
})
onMounted(load)
defineExpose({ openCreate, openEdit, save, toggle })
</script>

<template>
  <section class="master-page">
    <header class="master-heading">
      <div>
        <p class="eyebrow">MASTER DATA / 基础资料台账</p>
        <h1>组织与基础资料</h1>
        <p>按租户维护生产层级、往来单位与物料档案。</p>
      </div>
      <button
        v-if="canManage"
        class="primary-action compact"
        type="button"
        aria-label="新建基础资料"
        @click="openCreate"
      >
        <span>新建{{ current.label }}</span
        ><b>＋</b>
      </button>
    </header>

    <div class="pattern-tabs" role="tablist" aria-label="基础资料分类">
      <button
        v-for="item in categories"
        :key="item.type"
        type="button"
        role="tab"
        :aria-selected="item.type === activeType"
        :class="{ active: item.type === activeType }"
        @click="changeCategory(item.type)"
      >
        {{ item.label }}
      </button>
    </div>

    <div class="master-toolbar">
      <label
        >检索<input v-model="query" maxlength="120" placeholder="编码 / 名称" @keyup.enter="load"
      /></label>
      <label
        >状态
        <select v-model="active" aria-label="状态筛选">
          <option value="">全部</option>
          <option value="true">启用</option>
          <option value="false">停用</option>
        </select>
      </label>
      <button class="outline-action" type="button" @click="load">查询</button>
    </div>

    <div v-if="failure.message" class="master-error" role="alert">
      <b>{{ failure.message }}</b
      ><span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </div>

    <div class="master-table-wrap" :aria-busy="loading">
      <table class="master-table">
        <thead>
          <tr>
            <th>编码</th>
            <th>名称</th>
            <th>状态</th>
            <th>更新时间</th>
            <th v-if="canManage">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td>
              <code>{{ row.code }}</code>
            </td>
            <td>{{ row.name }}</td>
            <td>
              <span class="state-chip" :class="{ off: !row.active }">{{
                row.active ? '启用' : '停用'
              }}</span>
            </td>
            <td>{{ new Date(row.updatedAt).toLocaleString('zh-CN') }}</td>
            <td v-if="canManage">
              <button type="button" class="table-action" @click="openEdit(row)">编辑</button>
              <button type="button" class="table-action" @click="toggle(row)">
                {{ row.active ? '停用' : '启用' }}
              </button>
            </td>
          </tr>
          <tr v-if="!loading && rows.length === 0">
            <td :colspan="canManage ? 5 : 4" class="empty-cell">暂无{{ current.label }}资料</td>
          </tr>
        </tbody>
      </table>
    </div>

    <footer class="pager">
      <span>共 {{ total }} 条</span>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="size"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="prev, pager, next, sizes"
        @current-change="load"
      />
    </footer>

    <el-drawer
      v-model="drawer"
      :title="`${editingId ? '编辑' : '新建'}${current.label}`"
      size="min(520px, 94vw)"
    >
      <form class="master-form" @submit.prevent="save">
        <label for="md-code">编码</label
        ><input
          id="md-code"
          v-model="form.code"
          required
          maxlength="40"
          pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}"
        />
        <label for="md-name">名称</label
        ><input id="md-name" v-model="form.name" required maxlength="120" />
        <template v-if="activeType === 'warehouses'">
          <label for="md-organization">所属组织</label>
          <select
            id="md-organization"
            v-model="form.organizationId"
            required
            @change="onWarehouseOrganizationChange"
          >
            <option value="" disabled>请选择启用组织</option>
            <option v-for="item in organizationOptions" :key="item.id" :value="item.id">
              {{ item.code }} · {{ item.name }}
            </option>
          </select>
          <label for="md-factory">所属工厂（可选）</label>
          <select id="md-factory" v-model="form.factoryId" :disabled="!form.organizationId">
            <option value="">不限定工厂</option>
            <option v-for="item in factoryOptions" :key="item.id" :value="item.id">
              {{ item.code }} · {{ item.name }}
            </option>
          </select>
        </template>
        <template v-if="current.parent">
          <label for="md-parent">{{ current.parentLabel }}</label>
          <select id="md-parent" v-model="form.parentId" required>
            <option value="" disabled>请选择启用项</option>
            <option v-for="item in parentOptions" :key="item.id" :value="item.id">
              {{ item.code }} · {{ item.name }}
            </option>
          </select>
        </template>
        <template v-if="activeType === 'units-of-measure'">
          <label for="md-symbol">符号</label
          ><input id="md-symbol" v-model="form.symbol" required maxlength="16" />
          <label for="md-category">类别</label
          ><input id="md-category" v-model="form.category" required maxlength="32" />
          <label for="md-scale">小数位</label
          ><input
            id="md-scale"
            v-model.number="form.decimalScale"
            type="number"
            min="0"
            max="6"
            required
          />
        </template>
        <template v-if="activeType === 'materials'">
          <label for="md-material-type">物料类型</label>
          <select id="md-material-type" v-model="form.materialType" required>
            <option value="FABRIC">面料</option>
            <option value="ACCESSORY">辅料</option>
            <option value="PACKAGING">包装</option>
            <option value="OTHER">其他</option>
          </select>
          <label for="md-spec">规格</label
          ><input id="md-spec" v-model="form.specification" maxlength="160" />
          <label for="md-color">颜色 / 色号</label
          ><input id="md-color" v-model="form.color" maxlength="80" /><input
            v-model="form.colorCode"
            aria-label="色号"
            maxlength="40"
          />
        </template>
        <template v-if="activeType === 'customers' || activeType === 'suppliers'">
          <label for="md-contact">联系人</label
          ><input id="md-contact" v-model="form.contactName" maxlength="80" />
          <label for="md-phone">电话</label
          ><input id="md-phone" v-model="form.phone" maxlength="32" />
          <label for="md-email">邮箱</label
          ><input id="md-email" v-model="form.email" type="email" maxlength="160" />
          <label for="md-address">地址</label
          ><input id="md-address" v-model="form.address" maxlength="300" />
        </template>
        <button class="primary-action" type="submit"><span>保存资料</span><b>→</b></button>
      </form>
    </el-drawer>
  </section>
</template>
