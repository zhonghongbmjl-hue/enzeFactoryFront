import { expect, test, type APIResponse, type Page } from '@playwright/test'

type Fixture = { customerId: string; productId: string; skuId: string; suffix: string }
type Order = { id: string; orderNo: string }

const backend = 'http://127.0.0.1:18080/api/v1'

function dateAfter(days: number): string {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + days)
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

async function isolatedOrder(
  page: Page,
  token: string,
): Promise<{ fixture: Fixture; order: Order }> {
  const headers = { Authorization: `Bearer ${token}` }
  const fixture = await responseData<Fixture>(
    await page.request.post(`${backend}/test-support/reset`, { data: {}, headers }),
  )
  const namespace = `E2E-SEC-${fixture.suffix}-${crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 8)
    .toUpperCase()}`
  const order = await responseData<Order>(
    await page.request.post(`${backend}/sales-orders`, {
      headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        orderNo: namespace,
        customerId: fixture.customerId,
        orderDate: dateAfter(0),
        items: [
          {
            productId: fixture.productId,
            skuId: fixture.skuId,
            color: '黑色',
            size: 'M',
            fit: '常规',
            quantity: 1,
            deliveryDate: dateAfter(7),
            unitPrice: '100.0000',
          },
        ],
      },
    }),
  )
  return { fixture, order }
}

test('browser authentication gate and tenant boundary protect an isolated order namespace', async ({
  browser,
  page,
}) => {
  test.setTimeout(120_000)
  const token = await login(page)
  const { fixture, order } = await isolatedOrder(page, token)
  const foreign = await responseData<Order>(
    await page.request.post(`${backend}/test-support/foreign-order`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { runNamespace: `E2E-SEC-${fixture.suffix}` },
    }),
  )
  const crossTenantRead = await page.request.get(`${backend}/sales-orders/${foreign.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(crossTenantRead.status()).toBe(404)

  await page.goto('/orders')
  await page.getByRole('textbox', { name: '检索' }).fill(order.orderNo)
  await page.getByRole('button', { name: '查询' }).click()
  await expect(page.getByText(order.orderNo)).toBeVisible()
  await expect(page.getByText(foreign.orderNo)).toHaveCount(0)

  const anonymousContext = await browser.newContext()
  const anonymous = await anonymousContext.newPage()
  await anonymous.goto(`/orders/${order.id}`)
  await expect(anonymous).toHaveURL(/\/login\?returnTo=/)
  await expect(anonymous.getByRole('button', { name: '进入工厂控制台' })).toBeVisible()
  await anonymousContext.close()
})

test('browser security headers CORS and upload-content gate fail closed per run namespace', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const token = await login(page)
  const { order } = await isolatedOrder(page, token)

  const crossOrigin = await page.evaluate(
    async ({ api, bearer }) => {
      const response = await fetch(`${api}/auth/me`, {
        headers: { Authorization: `Bearer ${bearer}` },
      })
      return { status: response.status, body: await response.text() }
    },
    { api: backend, bearer: token },
  )
  expect(crossOrigin.status, crossOrigin.body).toBe(200)

  const anonymous = await page.request.get(`${backend}/sales-orders`)
  expect(anonymous.status()).toBe(401)
  expect(anonymous.headers()['x-content-type-options']).toBe('nosniff')
  expect(anonymous.headers()['x-frame-options']).toBe('DENY')
  expect(anonymous.headers()['cache-control']).toContain('no-store')

  const invalidUpload = await page.request.post(
    `${backend}/sales-orders/${order.id}/manual-delivery-evidence`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': crypto.randomUUID(),
      },
      multipart: {
        file: {
          name: `not-image-${crypto.randomUUID()}.png`,
          mimeType: 'image/png',
          buffer: Buffer.from('not an image'),
        },
      },
    },
  )
  expect(invalidUpload.status()).toBe(400)
  expect((await invalidUpload.json()) as { code: string }).toMatchObject({
    code: 'VALIDATION_ERROR',
  })
})
