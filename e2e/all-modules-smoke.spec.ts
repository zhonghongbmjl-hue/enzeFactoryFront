import { expect, test, type Page, type Response } from '@playwright/test'

const tenantCode = process.env.GARMENT_E2E_TENANT_CODE ?? 'demo'
const adminUsername = process.env.GARMENT_E2E_ADMIN_USERNAME ?? 'admin'
const adminPassword = process.env.GARMENT_E2E_DEMO_PASSWORD ?? 'DemoOnly!123'

const modules = [
  { name: '履约总览', path: '/' },
  { name: '基础资料', path: '/master-data' },
  { name: '产品纸样', path: '/products' },
  { name: '订单履约', path: '/orders' },
  { name: '库存领退', path: '/inventory' },
  { name: '裁剪齐套', path: '/cutting-kitting' },
  { name: '生产排产', path: '/production' },
  { name: '生产工单', path: '/work-orders' },
  { name: '品质闭环', path: '/quality' },
  { name: '售后待办', path: '/after-sales' },
] as const

async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('工厂租户代码').fill(tenantCode)
  await page.getByLabel('工号 / 账号').fill(adminUsername)
  await page.getByLabel('密码').fill(adminPassword)
  await page.getByRole('button', { name: '进入工厂控制台' }).click()
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
}

test('all primary modules render for the demo admin account', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes('narrow'), 'Run module smoke once on desktop')
  test.setTimeout(120_000)

  const browserErrors: string[] = []
  const failedApiResponses: Array<{ status: number; url: string }> = []

  page.on('pageerror', (error) => browserErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text())
  })
  page.on('response', (response: Response) => {
    const url = response.url()
    if (url.includes('/api/v1/') && [401, 403].includes(response.status())) {
      failedApiResponses.push({ status: response.status(), url })
    }
    if (url.includes('/api/v1/') && response.status() >= 500) {
      failedApiResponses.push({ status: response.status(), url })
    }
  })

  await login(page)

  for (const module of modules) {
    await test.step(module.name, async () => {
      await page.goto(module.path)
      await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
      await expect(page).not.toHaveURL(/\/forbidden(?:\?|$)/)
      await expect(page.locator('h1, h2').first()).toBeVisible()
      const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }))
      expect(layout.documentWidth, `${module.name} 不应产生整页横向滚动`).toBeLessThanOrEqual(
        layout.viewportWidth,
      )
    })
  }

  expect(failedApiResponses, '登录态接口不应出现 401/403/5xx').toEqual([])
  expect(browserErrors, '页面不应抛出浏览器错误').toEqual([])
})
