import { expect, test, type APIResponse, type Page } from '@playwright/test'

type Fixture = { customerId: string; productId: string; skuId: string; suffix: string }
type Order = { id: string; orderNo: string }
type TowerRow = { orderId: string; orderNo: string }
type TowerPage = {
  content: TowerRow[]
  totalElements: number
  totalPages: number
  page: number
}

const backend = 'http://127.0.0.1:18080/api/v1'

function isoDate(offsetDays: number): string {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

async function responseData<T>(response: APIResponse): Promise<T> {
  const text = await response.text()
  expect(response.ok(), text).toBeTruthy()
  return (JSON.parse(text) as { data: T }).data
}

async function login(page: Page): Promise<string> {
  await page.goto('/login')
  await page.getByLabel('工厂租户代码').fill('demo')
  await page.getByLabel('工号 / 账号').fill('admin')
  await page.getByLabel('密码').fill('DemoOnly!123')
  await page.getByRole('button', { name: '进入工厂控制台' }).click()
  await expect(page.getByRole('heading', { name: '订单履约控制塔' })).toBeVisible()
  return page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}') as { token?: string }
    return session.token ?? ''
  })
}

test('real API control tower renders delivery risk and paginates tenant-scoped orders', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('narrow'), 'Desktop owns the real business fixture')
  test.setTimeout(120_000)
  const anonymousForeign = await page.request.post(`${backend}/test-support/foreign-order`, {
    data: { runNamespace: 'E2E-UNAUTHORIZED' },
  })
  expect([401, 403]).toContain(anonymousForeign.status())
  const token = await login(page)
  const headers = { Authorization: `Bearer ${token}` }
  const fixture = await responseData<Fixture>(
    await page.request.post(`${backend}/test-support/reset`, { data: {}, headers }),
  )
  const runNamespace = `E2E-TOWER-${fixture.suffix}-${crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 12)
    .toUpperCase()}`
  const foreignOrder = await responseData<Order>(
    await page.request.post(`${backend}/test-support/foreign-order`, {
      data: { runNamespace },
      headers,
    }),
  )
  const created: Order[] = []
  for (let index = 0; index < 21; index++) {
    created.push(
      await responseData<Order>(
        await page.request.post(`${backend}/sales-orders`, {
          headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
          data: {
            orderNo: `${runNamespace}-${String(index).padStart(2, '0')}`,
            customerId: fixture.customerId,
            orderDate: isoDate(0),
            items: [
              {
                productId: fixture.productId,
                skuId: fixture.skuId,
                color: '黑色',
                size: 'M',
                fit: '常规',
                quantity: 1,
                deliveryDate: isoDate(2),
                unitPrice: '100.0000',
              },
            ],
          },
        }),
      ),
    )
  }

  const createdIds = new Set(created.map((order) => order.id))
  const allRows: TowerRow[] = []
  let apiPage = 0
  let apiTotalPages = 1
  while (apiPage < apiTotalPages) {
    const response = await responseData<TowerPage>(
      await page.request.get(`${backend}/dashboard/order-control-tower?page=${apiPage}&size=100`, {
        headers,
      }),
    )
    allRows.push(...response.content)
    apiTotalPages = response.totalPages
    apiPage += 1
  }
  expect(
    new Set(allRows.filter((row) => createdIds.has(row.orderId)).map((row) => row.orderId)),
  ).toEqual(createdIds)
  expect(allRows.some((row) => row.orderId === foreignOrder.id)).toBeFalsy()

  const currentRunByPage = new Map<number, Order[]>()
  let uiTotalPages = 1
  for (let index = 0; index < uiTotalPages; index++) {
    const response = await responseData<TowerPage>(
      await page.request.get(`${backend}/dashboard/order-control-tower?page=${index}&size=20`, {
        headers,
      }),
    )
    uiTotalPages = response.totalPages
    const rows = response.content.filter((row) => createdIds.has(row.orderId))
    if (rows.length > 0) {
      const byId = new Map(created.map((order) => [order.id, order]))
      currentRunByPage.set(
        index,
        rows.map((row) => byId.get(row.orderId)!),
      )
    }
  }
  expect([...currentRunByPage.values()].flat()).toHaveLength(21)
  expect(currentRunByPage.size).toBeGreaterThanOrEqual(2)

  await page.goto('/')
  await expect(page.getByText(`第 1 / ${uiTotalPages} 页`)).toBeVisible()
  let visiblePage = 0
  for (const [targetPage, orders] of [...currentRunByPage.entries()].sort(([a], [b]) => a - b)) {
    while (visiblePage < targetPage) {
      await page.getByTestId('next-page').click()
      visiblePage += 1
      await expect(page.getByText(`第 ${visiblePage + 1} / ${uiTotalPages} 页`)).toBeVisible()
    }
    for (const order of orders) {
      const card = page.locator(`[data-order-id="${order.id}"]`)
      await expect(card).toBeVisible()
      if (order.id === created[0]!.id) {
        await expect(card).toContainText('高风险')
        await expect(card).toContainText('冻结图 0')
      }
    }
  }
})

test('control tower becomes a single readable column on a narrow viewport', async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes('narrow'), 'Narrow viewport assertion')
  await login(page)
  await expect(page.getByRole('heading', { name: '订单履约控制塔' })).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()?.width ?? width)
})
