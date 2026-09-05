import { describe, expect, it } from 'vitest'
import { activeNavIndex, visibleAdminNav } from './nav'

describe('管理台导航信息架构', () => {
  it('按权限直接展示模块且不把上下文工作台伪装成独立目的页', () => {
    const items = visibleAdminNav(
      new Set([
        'ORDER_VIEW',
        'PROCUREMENT_VIEW',
        'SHIPMENT_VIEW',
        'PRODUCT_VIEW',
        'PRODUCTION_MANAGE',
        'QUALITY_INSPECT',
      ]),
    )
    expect(items.map((item) => item.index)).not.toContain('procurement')
    expect(items.map((item) => item.index)).not.toContain('shipment')
    expect(items.map((item) => item.label)).toEqual([
      '履约总览',
      '产品纸样',
      '订单履约',
      '生产排产',
      '生产工单',
      '品质闭环',
    ])
  })

  it('首页入口与首页路由使用相同的订单查看权限', () => {
    expect(visibleAdminNav(new Set()).map((item) => item.index)).not.toContain('dashboard')
    expect(visibleAdminNav(new Set(['ORDER_VIEW'])).map((item) => item.index)).toContain(
      'dashboard',
    )
  })

  it('采购、发运与详情路由高亮真实上级入口', () => {
    const items = visibleAdminNav(new Set(['ORDER_VIEW', 'PRODUCT_VIEW', 'PRODUCTION_MANAGE']))
    expect(activeNavIndex('procurement-workspace', '/procurement/order-1', items)).toBe(
      'sales-orders',
    )
    expect(activeNavIndex('shipment-workspace', '/shipments/order-1', items)).toBe('sales-orders')
    expect(activeNavIndex('bom-editor', '/bom-versions/bom-1', items)).toBe('products')
    expect(activeNavIndex('work-order-detail', '/work-orders/wo-1', items)).toBe('work-orders')
  })
})
