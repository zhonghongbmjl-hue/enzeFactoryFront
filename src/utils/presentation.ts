import { normalizeDecimal } from './decimal'

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: '启用',
  INACTIVE: '停用',
  DRAFT: '草稿',
  PENDING: '待处理',
  PENDING_APPROVAL: '待审批',
  APPROVED: '已审批',
  PARTIALLY_APPROVED: '部分审批',
  RELEASED: '已下达',
  IN_PRODUCTION: '生产中',
  PROCESS_INSPECTION: '过程初检',
  READY_TO_COMPLETE: '待完工',
  TRIMMING: '后整中',
  READY_FOR_QUALITY: '待成品质检',
  INSPECTING: '质检中',
  REWORK: '返工中',
  NONCONFORMING_PENDING_APPROVAL: '不合格品待审批',
  PASSED: '已通过',
  PARTIAL: '部分通过',
  FAILED: '未通过',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
  SIGNED: '已签收',
  PARTIALLY_SIGNED: '部分签收',
  DISPATCHED: '已发运',
  PARTIALLY_DISPATCHED: '部分发运',
  PENDING_DISPATCH: '待发运',
  CREATED: '已创建',
  RETURN_IN_TRANSIT: '退货在途',
  RECEIVED_AND_QUARANTINED: '已收货隔离',
  REWORKING: '返工中',
  QUALITY_INSPECTION: '质量复检',
  REPACKING: '重新装箱',
  RESHIPPED: '已重新发运',
  AFTER_SALES_OBSERVATION: '售后观察',
  MATERIAL_PREPARING: '物料准备中',
  MATERIAL_READY: '物料齐套',
  READY_FOR_PRODUCTION: '待生产',
  PARTIALLY_READY: '部分齐套',
  READY: '已齐套',
  QUALITY_INSPECTION_PENDING: '待质检',
  PACKING: '包装中',
  PARTIALLY_SHIPPED: '部分发货',
  SHIPPED: '已发货',
  CANCELLED: '已取消',
}

export function formatStatus(value: string | null | undefined): string {
  if (!value) return '状态待同步'
  return STATUS_LABELS[value] ?? value.replaceAll('_', ' ')
}

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—'
  try {
    return normalizeDecimal(String(value))
  } catch {
    return String(value)
  }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`
}

export function shortReference(value: string | null | undefined): string {
  if (!value) return '—'
  return value.length > 12 ? `${value.slice(0, 8)}…` : value
}

export function isCompletedStatus(value: string | null | undefined): boolean {
  return value === 'COMPLETED' || value === 'CLOSED' || value === 'SIGNED' || value === 'PASSED'
}
