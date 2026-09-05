import { expect, test, type Page } from '@playwright/test'

test('anonymous operator sees the factory login surface', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login\?returnTo=(?:%2F|\/)$/)
  await expect(page.getByRole('heading', { name: '登录控制台' })).toBeVisible()
  await expect(page.getByLabel('工厂租户代码')).toBeVisible()
  await expect(page.getByRole('button', { name: '进入工厂控制台' })).toBeVisible()
})

test('login surface does not overflow a narrow viewport', async ({ page }) => {
  await page.goto('/login')
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  const viewport = page.viewportSize()
  expect(width).toBeLessThanOrEqual(viewport?.width ?? width)
})

test('login shell stays within every supported layout breakpoint', async ({ page }) => {
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 768 ? 812 : 900 })
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: '登录控制台' })).toBeVisible()
    const layout = await page.evaluate(() => {
      const button = document.querySelector<HTMLButtonElement>('.login-submit')
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        buttonHeight: button?.getBoundingClientRect().height ?? 0,
      }
    })
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
    expect(layout.buttonHeight).toBeGreaterThanOrEqual(width < 768 ? 44 : 40)
  }
})

test('every primary business route renders without whole-page overflow', async ({ page }) => {
  await installFullPermissionSession(page)
  const routes = [
    ['/', '订单履约控制塔'],
    ['/master-data', '组织与基础资料'],
    ['/products', '产品纸样台账'],
    ['/orders', '订单履约台账'],
    ['/inventory', '库存与领退料'],
    ['/cutting-kitting', '裁剪与齐套'],
    ['/production', '生产排产驾驶舱'],
    ['/work-orders', '生产工单'],
    ['/quality', '品质工作台'],
    ['/after-sales', '全租户售后待办'],
  ] as const

  for (const [path, heading] of routes) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
    }))
    expect(layout.documentWidth, `${path} 不应产生整页横向滚动`).toBeLessThanOrEqual(
      layout.viewportWidth,
    )
  }
})

async function installFullPermissionSession(page: Page) {
  const profile = {
    userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
    username: 'admin',
    displayName: '生产主管',
    tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
    tenantCode: 'needle-one',
    roles: ['ADMIN'],
    permissions: [
      'ORDER_VIEW',
      'MASTERDATA_VIEW',
      'PRODUCT_VIEW',
      'PRODUCTION_MANAGE',
      'INVENTORY_MANAGE',
      'QUALITY_INSPECT',
      'AFTER_SALES_MANAGE',
      'SHIPMENT_VIEW',
      'PROCUREMENT_VIEW',
    ],
  }
  await page.addInitScript((restoredProfile) => {
    sessionStorage.setItem(
      'garment.auth',
      JSON.stringify({
        schemaVersion: 1,
        token: 'signed.jwt',
        expiresAt: '2099-08-23T12:00:00Z',
        profile: restoredProfile,
        authGeneration: 1,
      }),
    )
  }, profile)
  await page.route('**/api/v1/**', (route) => {
    const data = new URL(route.request().url()).pathname.endsWith('/auth/me')
      ? profile
      : { content: [], page: 0, number: 0, size: 20, totalElements: 0, totalPages: 0 }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    })
  })
}

test('logging directly into another tenant clears the unverified prior tenant cache', async ({
  page,
}) => {
  const oldProfile = {
    userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
    username: 'planner',
    displayName: '生产计划员',
    tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
    tenantCode: 'needle-one',
    roles: ['PRODUCTION_SUPERVISOR'],
    permissions: ['ORDER_VIEW', 'PRODUCTION_MANAGE'],
  }
  const newProfile = {
    ...oldProfile,
    tenantId: '9f20640a-13c8-41ba-918c-58ab75f7b913',
    tenantCode: 'needle-two',
  }
  await page.route('**/api/v1/auth/login', async (route) => {
    expect(route.request().postDataJSON()).toMatchObject({ tenantCode: 'needle-two' })
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '成功',
        data: {
          accessToken: 'new.signed.jwt',
          tokenType: 'Bearer',
          expiresAt: '2099-08-23T12:00:00Z',
        },
        traceId: 'trace-login',
        timestamp: '2026-08-23T00:00:00Z',
      }),
    })
  })
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '成功',
        data: newProfile,
        traceId: 'trace-me',
        timestamp: '2026-08-23T00:00:00Z',
      }),
    })
  })
  await page.route('**/api/v1/dashboard/order-control-tower?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
      }),
    }),
  )

  await page.goto('/login')
  await page.evaluate((restoredProfile) => {
    sessionStorage.setItem(
      'garment.auth',
      JSON.stringify({
        schemaVersion: 1,
        token: 'old.signed.jwt',
        expiresAt: '2099-08-23T12:00:00Z',
        profile: restoredProfile,
        authGeneration: 1,
      }),
    )
    sessionStorage.setItem('garment.tenant.orders', 'old-orders')
    localStorage.setItem('garment.tenant.filters', 'old-filters')
    localStorage.setItem('other-site.preference', 'keep-me')
  }, oldProfile)
  await page.getByLabel('工厂租户代码').fill('needle-two')
  await page.getByLabel('工号 / 账号').fill('planner')
  await page.getByLabel('密码').fill('workshop-123')
  await page.getByRole('button', { name: '进入工厂控制台' }).click()

  await expect(page.getByRole('heading', { name: '订单履约控制塔' })).toBeVisible()
  const stored = await page.evaluate(() => ({
    auth: JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}'),
    sessionTenant: sessionStorage.getItem('garment.tenant.orders'),
    localTenant: localStorage.getItem('garment.tenant.filters'),
    unrelated: localStorage.getItem('other-site.preference'),
  }))
  expect(stored.auth).toMatchObject({ token: 'new.signed.jwt', profile: newProfile })
  expect(stored.sessionTenant).toBeNull()
  expect(stored.localTenant).toBeNull()
  expect(stored.unrelated).toBe('keep-me')
})

test('narrow navigation keeps meaningful visible and accessible labels', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('narrow'), 'Narrow viewport assertion')
  const profile = {
    userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
    username: 'planner',
    displayName: '生产计划员',
    tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
    tenantCode: 'needle-one',
    roles: ['PRODUCTION_SUPERVISOR'],
    permissions: ['ORDER_VIEW', 'PRODUCTION_MANAGE'],
  }
  await page.addInitScript(
    ({ restoredProfile }) => {
      sessionStorage.setItem(
        'garment.auth',
        JSON.stringify({
          schemaVersion: 1,
          token: 'signed.jwt',
          expiresAt: '2099-08-23T12:00:00Z',
          profile: restoredProfile,
          authGeneration: 1,
        }),
      )
    },
    { restoredProfile: profile },
  )
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '成功',
        data: profile,
        traceId: 'trace-e2e',
        timestamp: '2026-08-23T00:00:00Z',
      }),
    })
  })
  await page.route('**/api/v1/dashboard/order-control-tower?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 },
      }),
    }),
  )

  await page.goto('/')

  const navigationTrigger = page.getByRole('button', { name: '打开主导航' })
  await expect(navigationTrigger).toBeVisible()
  await navigationTrigger.click()
  const overview = page.getByRole('menuitem', { name: '履约总览', exact: true })
  const planning = page.getByRole('menuitem', { name: '生产排产', exact: true })
  const mobileNavigation = page.getByRole('navigation', { name: '移动主导航' })
  await expect(overview).toBeVisible()
  await expect(planning).toBeVisible()
  await expect(mobileNavigation.getByText('总览', { exact: true })).toBeVisible()
  await expect(mobileNavigation.getByText('生产', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(mobileNavigation).toBeHidden()
  await expect(navigationTrigger).toBeFocused()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? width)
})

test('master-data workbench is permission-routed and remains usable without full-list loading', async ({
  page,
}) => {
  const profile = {
    userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
    username: 'master-admin',
    displayName: '基础资料管理员',
    tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
    tenantCode: 'needle-one',
    roles: ['ADMIN'],
    permissions: ['MASTERDATA_VIEW', 'MASTERDATA_MANAGE'],
  }
  await page.addInitScript(
    ({ restoredProfile }) => {
      sessionStorage.setItem(
        'garment.auth',
        JSON.stringify({
          schemaVersion: 1,
          token: 'signed.jwt',
          expiresAt: '2099-08-23T12:00:00Z',
          profile: restoredProfile,
          authGeneration: 1,
        }),
      )
    },
    { restoredProfile: profile },
  )
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '成功',
        data: profile,
        traceId: 'trace-master-data',
        timestamp: '2026-08-23T00:00:00Z',
      }),
    }),
  )
  await page.route('**/api/v1/organizations?*', async (route) => {
    expect(route.request().url()).toContain('page=0')
    expect(route.request().url()).toContain('size=20')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { content: [], totalElements: 0, totalPages: 0, number: 0, size: 20 },
      }),
    })
  })

  await page.goto('/master-data')
  await expect(page.getByRole('heading', { name: '组织与基础资料' })).toBeVisible()
  await page.getByRole('button', { name: '新建基础资料' }).click()
  await expect(page.getByLabel('编码')).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? width)
})

async function installProductSession(page: import('@playwright/test').Page) {
  const profile = {
    userId: 'a8e88635-c2db-48ce-a384-fec40cd75cb4',
    username: 'product-admin',
    displayName: '产品主管',
    tenantId: '7e179539-02b7-4190-bcad-83edcbb66a81',
    tenantCode: 'needle-one',
    roles: ['ADMIN'],
    permissions: ['PRODUCT_VIEW', 'PRODUCT_MANAGE', 'PRODUCT_APPROVE'],
  }
  await page.addInitScript(
    (p) =>
      sessionStorage.setItem(
        'garment.auth',
        JSON.stringify({
          schemaVersion: 1,
          token: 'signed.jwt',
          expiresAt: '2099-08-23T12:00:00Z',
          profile: p,
          authGeneration: 1,
        }),
      ),
    profile,
  )
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '成功',
        data: profile,
        traceId: 'trace-product',
        timestamp: '2026-08-23T00:00:00Z',
      }),
    }),
  )
}

test('product list and detail expose permission actions without viewport overflow', async ({
  page,
}) => {
  await installProductSession(page)
  const product = {
    id: 'p1',
    styleNo: 'JW-001',
    name: '工业纸样款',
    brand: 'JW',
    series: '核心',
    category: '连衣裙',
    season: '夏',
    targetPrice: 99,
    fit: 'REGULAR',
    status: 'DRAFT',
    version: 0,
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
  }
  await page.route('**/api/v1/products?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: { content: [product], totalElements: 1, totalPages: 1, number: 0, size: 20 },
      }),
    }),
  )
  await page.route('**/api/v1/products/p1', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: product }) }),
  )
  await page.route('**/api/v1/products/p1/skus', (route) =>
    route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: [] }) }),
  )
  await page.route('**/api/v1/bom-versions?*', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: { content: [], totalElements: 0, totalPages: 0, page: 0, size: 20 },
      }),
    }),
  )
  await page.goto('/products')
  await expect(page.getByRole('heading', { name: '产品纸样台账' })).toBeVisible()
  await page.goto('/products/p1')
  await expect(page.getByRole('button', { name: '编辑草稿' })).toBeVisible()
  await expect(page.getByRole('button', { name: '审核上架' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
})

test('BOM material query can select a catalog item beyond the first fifty and save it', async ({
  page,
}) => {
  await installProductSession(page)
  const bom = {
    id: 'b1',
    productId: 'p1',
    versionNo: 'V2',
    name: '生产BOM V2',
    status: 'DRAFT',
    version: 0,
    submittedAt: null,
    approvedAt: null,
    activatedAt: null,
    retiredAt: null,
    createdAt: '2026-08-23T00:00:00Z',
    updatedAt: '2026-08-23T00:00:00Z',
    items: [],
  }
  await page.route('**/api/v1/bom-versions/b1', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { items: Array<{ materialId: string }> }
      expect(body.items[0]?.materialId).toBe('m51')
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data: bom }) })
  })
  await page.route('**/api/v1/materials/select?*', async (route) => {
    const query = new URL(route.request().url()).searchParams.get('query')
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data:
          query === 'MAT-051'
            ? [{ id: 'm51', code: 'MAT-051', name: '第51号面料', active: true }]
            : [],
      }),
    })
  })
  await page.goto('/bom-versions/b1')
  await page.getByLabel('检索物料').fill('MAT-051')
  await page.getByRole('button', { name: '查询启用物料' }).click()
  await page.getByRole('button', { name: '添加物料' }).click()
  await expect(page.getByLabel('物料', { exact: true })).toHaveValue('m51')
  await page.getByRole('button', { name: '保存草稿' }).click()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  )
})
