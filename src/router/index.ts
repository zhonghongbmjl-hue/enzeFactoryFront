import type { Pinia } from 'pinia'
import { createRouter, createWebHistory, type Router, type RouterHistory } from 'vue-router'
import LoginView from '@/views/auth/LoginView.vue'
import OrderControlTowerView from '@/views/dashboard/OrderControlTowerView.vue'
import AdminLayout from '@/layouts/AdminLayout.vue'
import ForbiddenView from '@/views/errors/ForbiddenView.vue'
import SessionCheckView from '@/views/auth/SessionCheckView.vue'
import MasterDataView from '@/views/masterdata/MasterDataView.vue'
import ProductListView from '@/views/products/ProductListView.vue'
import ProductDetailView from '@/views/products/ProductDetailView.vue'
import BomEditorView from '@/views/products/BomEditorView.vue'
import SalesOrderListView from '@/views/orders/SalesOrderListView.vue'
import SalesOrderDetailView from '@/views/orders/SalesOrderDetailView.vue'
import ProcurementWorkspaceView from '@/views/procurement/ProcurementWorkspaceView.vue'
import InventoryView from '@/views/inventory/InventoryView.vue'
import CuttingAndKittingView from '@/views/cutting/CuttingAndKittingView.vue'
import ProductionPlanningView from '@/views/planning/ProductionPlanningView.vue'
import WorkOrderListView from '@/views/production/WorkOrderListView.vue'
import WorkOrderDetailView from '@/views/production/WorkOrderDetailView.vue'
import QualityWorkspaceView from '@/views/quality/QualityWorkspaceView.vue'
import ShipmentWorkspaceView from '@/views/shipment/ShipmentWorkspaceView.vue'
import AfterSalesReworkView from '@/views/shipment/AfterSalesReworkView.vue'
import AfterSalesInboxView from '@/views/shipment/AfterSalesInboxView.vue'
import { useAuthStore } from '@/stores/auth'
import { safeReturnTo } from './safeReturn'

export { safeReturnTo } from './safeReturn'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    permissions?: string[]
    anyPermissions?: string[]
  }
}

export function createApplicationRouter(
  pinia: Pinia,
  history: RouterHistory = createWebHistory(import.meta.env.BASE_URL),
): Router {
  const router = createRouter({
    history,
    routes: [
      { path: '/login', name: 'login', component: LoginView },
      {
        path: '/',
        component: AdminLayout,
        meta: { requiresAuth: true },
        children: [
          {
            path: '',
            name: 'dashboard',
            component: OrderControlTowerView,
            meta: { requiresAuth: true, permissions: ['ORDER_VIEW'] },
          },
          {
            path: 'master-data',
            name: 'master-data',
            component: MasterDataView,
            meta: { requiresAuth: true, permissions: ['MASTERDATA_VIEW'] },
          },
          {
            path: 'production',
            name: 'production',
            component: ProductionPlanningView,
            meta: { requiresAuth: true, permissions: ['PRODUCTION_MANAGE'] },
          },
          {
            path: 'work-orders',
            name: 'work-orders',
            component: WorkOrderListView,
            meta: { requiresAuth: true, permissions: ['PRODUCTION_MANAGE'] },
          },
          {
            path: 'work-orders/:id',
            name: 'work-order-detail',
            component: WorkOrderDetailView,
            meta: { requiresAuth: true, permissions: ['PRODUCTION_MANAGE'] },
          },
          {
            path: 'products',
            name: 'products',
            component: ProductListView,
            meta: { requiresAuth: true, permissions: ['PRODUCT_VIEW'] },
          },
          {
            path: 'products/:id',
            name: 'product-detail',
            component: ProductDetailView,
            meta: { requiresAuth: true, permissions: ['PRODUCT_VIEW'] },
          },
          {
            path: 'bom-versions/:bomId',
            name: 'bom-editor',
            component: BomEditorView,
            meta: { requiresAuth: true, permissions: ['PRODUCT_VIEW'] },
          },
          {
            path: 'orders',
            name: 'sales-orders',
            component: SalesOrderListView,
            meta: { requiresAuth: true, permissions: ['ORDER_VIEW'] },
          },
          {
            path: 'orders/:id',
            name: 'sales-order-detail',
            component: SalesOrderDetailView,
            meta: { requiresAuth: true, permissions: ['ORDER_VIEW'] },
          },
          {
            path: 'procurement/:orderId',
            name: 'procurement-workspace',
            component: ProcurementWorkspaceView,
            meta: { requiresAuth: true, permissions: ['PROCUREMENT_VIEW'] },
          },
          {
            path: 'inventory',
            name: 'inventory',
            component: InventoryView,
            meta: { requiresAuth: true, permissions: ['INVENTORY_MANAGE'] },
          },
          {
            path: 'cutting-kitting',
            name: 'cutting-kitting',
            component: CuttingAndKittingView,
            meta: { requiresAuth: true, permissions: ['INVENTORY_MANAGE'] },
          },
          {
            path: 'quality',
            name: 'quality',
            component: QualityWorkspaceView,
            meta: { requiresAuth: true, permissions: ['QUALITY_INSPECT'] },
          },
          {
            path: 'shipments/:orderId',
            name: 'shipment-workspace',
            component: ShipmentWorkspaceView,
            meta: { requiresAuth: true, anyPermissions: ['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'] },
          },
          {
            path: 'after-sales',
            name: 'after-sales-inbox',
            component: AfterSalesInboxView,
            meta: { requiresAuth: true, permissions: ['AFTER_SALES_MANAGE'] },
          },
          {
            path: 'after-sales/:caseId',
            name: 'after-sales-rework',
            component: AfterSalesReworkView,
            meta: { requiresAuth: true, anyPermissions: ['SHIPMENT_VIEW', 'AFTER_SALES_MANAGE'] },
          },
        ],
      },
      { path: '/forbidden', name: 'forbidden', component: ForbiddenView },
      { path: '/session-check', name: 'session-check', component: SessionCheckView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
  router.beforeEach(async (to) => {
    const auth = useAuthStore(pinia)
    if (to.name === 'login' && auth.isAuthenticated) {
      return safeReturnTo(to.query.returnTo)
    }
    if (to.meta.requiresAuth) {
      if (auth.sessionStatus === 'restored' || auth.sessionStatus === 'validating') {
        const validation = await auth.validateRestoredSession()
        if (validation === 'retry') {
          return { name: 'session-check', query: { returnTo: safeReturnTo(to.fullPath) } }
        }
      }
      if (auth.sessionStatus === 'validation-error') {
        return { name: 'session-check', query: { returnTo: safeReturnTo(to.fullPath) } }
      }
      if (!auth.isAuthenticated) {
        return { name: 'login', query: { returnTo: safeReturnTo(to.fullPath) } }
      }
    }
    const required = to.meta.permissions ?? []
    if (required.some((permission) => !auth.permissions.has(permission))) {
      return { name: 'forbidden' }
    }
    const alternatives = to.meta.anyPermissions ?? []
    if (
      alternatives.length > 0 &&
      !alternatives.some((permission) => auth.permissions.has(permission))
    ) {
      return { name: 'forbidden' }
    }
    return true
  })
  return router
}
