<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElMessage } from 'element-plus'
import { masterDataApi } from '@/api/masterdata'
import { useAuthStore } from '@/stores/auth'
import { useMasterDataStore } from '@/stores/masterdata'
import { emptyFailure, toFailure } from '@/stores/failure'
import ResponsiveFilterBar from '@/components/layout/ResponsiveFilterBar.vue'
import SelectField from '@/components/form/SelectField.vue'
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

const masterdata = useMasterDataStore()
const { activeType, rows, loading, total, page, size, query, active, failure } =
  storeToRefs(masterdata)
const filtersOpen = ref(false)
const drawer = ref(false)
const editingId = ref('')
const parentOptions = ref<MasterDataOption[]>([])
const organizationOptions = ref<MasterDataOption[]>([])
const factoryOptions = ref<MasterDataOption[]>([])
const form = reactive<MasterDataInput>({ code: '', name: '' })
const auth = useAuthStore()
let factoryRequestGeneration = 0

const current = computed(() => categories.find((item) => item.type === activeType.value)!)
const canManage = computed(() => auth.permissions.has('MASTERDATA_MANAGE'))
const organizationSelectOptions = computed(() =>
  organizationOptions.value.map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)
const factorySelectOptions = computed(() =>
  factoryOptions.value.map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)
const parentSelectOptions = computed(() =>
  parentOptions.value.map((item) => ({
    label: `${item.code} · ${item.name}`,
    value: item.id,
  })),
)
const materialTypeOptions = [
  { label: '面料', value: 'FABRIC' },
  { label: '辅料', value: 'ACCESSORY' },
  { label: '包装', value: 'PACKAGING' },
  { label: '其他', value: 'OTHER' },
]

function resetFailure(): void {
  failure.value = emptyFailure()
}

function load(): Promise<void> {
  return masterdata.load()
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
    failure.value = toFailure(error, '工厂选项加载失败')
  }
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
    failure.value = toFailure(error, '保存失败，请检查字段')
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
    failure.value = toFailure(error, '状态更新失败')
  }
}

function asRecord(row: unknown): MasterDataRecord {
  return row as MasterDataRecord
}

watch(active, () => {
  page.value = 1
  void load()
})

function onSizeChange(): void {
  page.value = 1
  void load()
}

function onCategory(type: MasterDataType): Promise<void> {
  return masterdata.selectType(type)
}

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
      <el-button v-if="canManage" type="primary" aria-label="新建基础资料" @click="openCreate">
        新建{{ current.label }}
      </el-button>
    </header>

    <div class="pattern-tabs" role="tablist" aria-label="基础资料分类">
      <el-button
        v-for="item in categories"
        :key="item.type"
        role="tab"
        :aria-selected="item.type === activeType"
        :type="item.type === activeType ? 'primary' : 'default'"
        @click="onCategory(item.type)"
      >
        {{ item.label }}
      </el-button>
    </div>

    <ResponsiveFilterBar v-model="filtersOpen" form-id="master-data-filters" @submit="load">
      <el-form-item label="关键词">
        <el-input
          v-model="query"
          clearable
          maxlength="120"
          placeholder="编码 / 名称"
          @keyup.enter="load"
        />
      </el-form-item>
      <el-form-item label="状态">
        <el-radio-group v-model="active" aria-label="状态筛选">
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="enabled">启用</el-radio-button>
          <el-radio-button value="disabled">停用</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <template #actions>
        <el-button native-type="submit">查询</el-button>
      </template>
    </ResponsiveFilterBar>

    <el-alert
      v-if="failure.message"
      :title="failure.message"
      type="error"
      :closable="false"
      show-icon
      role="alert"
    >
      <span v-if="failure.traceId">追踪号 {{ failure.traceId }}</span>
    </el-alert>

    <div class="master-table-wrap desktop-record-table" :aria-busy="loading">
      <el-table v-loading="loading" :data="rows" empty-text="暂无资料">
        <el-table-column label="编码" min-width="120">
          <template #default="{ row }">
            <code>{{ row.code }}</code>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="名称" min-width="160" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.active ? 'success' : 'info'" size="small">
              {{ row.active ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="180">
          <template #default="{ row }">
            {{ new Date(row.updatedAt).toLocaleString('zh-CN') }}
          </template>
        </el-table-column>
        <el-table-column v-if="canManage" label="操作" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(asRecord(row))">编辑</el-button>
            <el-button link type="primary" @click="toggle(asRecord(row))">
              {{ asRecord(row).active ? '停用' : '启用' }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>暂无{{ current.label }}资料</template>
      </el-table>
    </div>
    <div v-if="rows.length" class="mobile-record-list" :aria-busy="loading">
      <article v-for="row in rows" :key="row.id" class="mobile-record-card">
        <header>
          <div>
            <code>{{ row.code }}</code
            ><small>{{ current.label }}</small>
          </div>
          <el-tag :type="row.active ? 'success' : 'info'" size="small">
            {{ row.active ? '启用' : '停用' }}
          </el-tag>
        </header>
        <h2>{{ row.name }}</h2>
        <dl>
          <div>
            <dt>更新时间</dt>
            <dd>{{ new Date(row.updatedAt).toLocaleString('zh-CN') }}</dd>
          </div>
        </dl>
        <footer v-if="canManage">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" @click="toggle(row)">
            {{ row.active ? '停用' : '启用' }}
          </el-button>
        </footer>
      </article>
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
        @size-change="onSizeChange"
      />
    </footer>

    <el-drawer
      v-model="drawer"
      :title="`${editingId ? '编辑' : '新建'}${current.label}`"
      size="min(480px, 94vw)"
    >
      <el-form class="master-form" label-position="top" @submit.prevent="save">
        <el-form-item label="编码">
          <el-input
            id="md-code"
            v-model="form.code"
            maxlength="40"
            pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}"
          />
        </el-form-item>
        <el-form-item label="名称">
          <el-input id="md-name" v-model="form.name" maxlength="120" />
        </el-form-item>
        <template v-if="activeType === 'warehouses'">
          <el-form-item label="所属组织">
            <SelectField
              id="md-organization"
              :model-value="form.organizationId ?? ''"
              placeholder="请选择启用组织"
              aria-required="true"
              :options="organizationSelectOptions"
              @update:model-value="form.organizationId = String($event ?? '')"
              @change="onWarehouseOrganizationChange"
            />
          </el-form-item>
          <el-form-item label="所属工厂（可选）">
            <SelectField
              id="md-factory"
              :model-value="form.factoryId ?? ''"
              clearable
              placeholder="不限定工厂"
              :disabled="!form.organizationId"
              :options="factorySelectOptions"
              @update:model-value="form.factoryId = String($event ?? '')"
            />
          </el-form-item>
        </template>
        <template v-if="current.parent">
          <el-form-item :label="current.parentLabel ?? '上级'">
            <SelectField
              id="md-parent"
              :model-value="form.parentId ?? ''"
              placeholder="请选择启用项"
              aria-required="true"
              :options="parentSelectOptions"
              @update:model-value="form.parentId = String($event ?? '')"
            />
          </el-form-item>
        </template>
        <template v-if="activeType === 'units-of-measure'">
          <el-form-item label="符号">
            <el-input id="md-symbol" v-model="form.symbol" maxlength="16" />
          </el-form-item>
          <el-form-item label="类别">
            <el-input id="md-category" v-model="form.category" maxlength="32" />
          </el-form-item>
          <el-form-item label="小数位">
            <el-input id="md-scale" v-model.number="form.decimalScale" type="number" min="0" />
          </el-form-item>
        </template>
        <template v-if="activeType === 'materials'">
          <el-form-item label="物料类型">
            <SelectField
              id="md-material-type"
              :model-value="form.materialType ?? ''"
              aria-required="true"
              :options="materialTypeOptions"
              @update:model-value="
                form.materialType = String($event ?? '') as MasterDataInput['materialType']
              "
            />
          </el-form-item>
          <el-form-item label="规格">
            <el-input id="md-spec" v-model="form.specification" maxlength="160" />
          </el-form-item>
          <el-form-item label="颜色 / 色号">
            <el-space>
              <el-input id="md-color" v-model="form.color" maxlength="80" />
              <el-input v-model="form.colorCode" aria-label="色号" maxlength="40" />
            </el-space>
          </el-form-item>
        </template>
        <template v-if="activeType === 'customers' || activeType === 'suppliers'">
          <el-form-item label="联系人">
            <el-input id="md-contact" v-model="form.contactName" maxlength="80" />
          </el-form-item>
          <el-form-item label="电话">
            <el-input id="md-phone" v-model="form.phone" maxlength="32" />
          </el-form-item>
          <el-form-item label="邮箱">
            <el-input id="md-email" v-model="form.email" type="email" maxlength="160" />
          </el-form-item>
          <el-form-item class="field-wide" label="地址">
            <el-input id="md-address" v-model="form.address" maxlength="300" />
          </el-form-item>
        </template>
        <el-button type="primary" native-type="submit">保存资料</el-button>
      </el-form>
    </el-drawer>
  </section>
</template>
