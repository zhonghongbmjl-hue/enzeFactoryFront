import type { Component } from 'vue'
import {
  Box,
  Calendar,
  CircleCheck,
  DataBoard,
  Document,
  Goods,
  Headset,
  List,
  Notebook,
  Scissor,
} from '@element-plus/icons-vue'

export interface AdminNavItem {
  index: string
  path: string
  label: string
  ariaLabel: string
  icon: Component
  visible: (permissions: ReadonlySet<string>) => boolean
}

export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  {
    index: 'dashboard',
    path: '/',
    label: '履约总览',
    ariaLabel: '履约总览',
    icon: DataBoard,
    visible: (permissions) => permissions.has('ORDER_VIEW'),
  },
  {
    index: 'master-data',
    path: '/master-data',
    label: '基础资料',
    ariaLabel: '基础资料',
    icon: Notebook,
    visible: (permissions) => permissions.has('MASTERDATA_VIEW'),
  },
  {
    index: 'products',
    path: '/products',
    label: '产品纸样',
    ariaLabel: '产品纸样',
    icon: Goods,
    visible: (permissions) => permissions.has('PRODUCT_VIEW'),
  },
  {
    index: 'sales-orders',
    path: '/orders',
    label: '订单履约',
    ariaLabel: '订单履约',
    icon: Document,
    visible: (permissions) => permissions.has('ORDER_VIEW'),
  },
  {
    index: 'inventory',
    path: '/inventory',
    label: '库存领退',
    ariaLabel: '库存与领退料',
    icon: Box,
    visible: (permissions) => permissions.has('INVENTORY_MANAGE'),
  },
  {
    index: 'cutting-kitting',
    path: '/cutting-kitting',
    label: '裁剪齐套',
    ariaLabel: '裁剪与齐套',
    icon: Scissor,
    visible: (permissions) => permissions.has('INVENTORY_MANAGE'),
  },
  {
    index: 'production',
    path: '/production',
    label: '生产排产',
    ariaLabel: '生产排产',
    icon: Calendar,
    visible: (permissions) => permissions.has('PRODUCTION_MANAGE'),
  },
  {
    index: 'work-orders',
    path: '/work-orders',
    label: '生产工单',
    ariaLabel: '生产工单',
    icon: List,
    visible: (permissions) => permissions.has('PRODUCTION_MANAGE'),
  },
  {
    index: 'quality',
    path: '/quality',
    label: '品质闭环',
    ariaLabel: '成品质量闭环',
    icon: CircleCheck,
    visible: (permissions) => permissions.has('QUALITY_INSPECT'),
  },
  {
    index: 'after-sales',
    path: '/after-sales',
    label: '售后待办',
    ariaLabel: '售后待办',
    icon: Headset,
    visible: (permissions) => permissions.has('AFTER_SALES_MANAGE'),
  },
]

const CONTEXTUAL_NAV_INDEX: Record<string, string> = {
  'product-detail': 'products',
  'bom-editor': 'products',
  'sales-order-detail': 'sales-orders',
  'procurement-workspace': 'sales-orders',
  'shipment-workspace': 'sales-orders',
  'work-order-detail': 'work-orders',
  'after-sales-rework': 'after-sales',
}

export function visibleAdminNav(permissions: ReadonlySet<string>): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => item.visible(permissions))
}

export function activeNavIndex(
  routeName: string,
  pathname: string,
  items: readonly AdminNavItem[],
): string {
  const contextual = CONTEXTUAL_NAV_INDEX[routeName]
  if (contextual && items.some((item) => item.index === contextual)) return contextual
  const named = items.find((item) => item.index === routeName)
  if (named) return named.index
  const match = items.find((item) => {
    if (item.path === '/') return pathname === '/'
    return pathname === item.path || pathname.startsWith(`${item.path}/`)
  })
  return match?.index ?? ''
}
