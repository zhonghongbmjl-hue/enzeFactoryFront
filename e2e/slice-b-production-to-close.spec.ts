import { expect, test, type APIResponse, type Browser, type Page } from '@playwright/test'

type Entity = Record<string, unknown> & { id: string; version: number; status?: string }
type Fixture = {
  customerId: string
  supplierId: string
  warehouseId: string
  fabricMaterialId: string
  accessoryMaterialId: string
  productId: string
  skuId: string
  factoryId: string
  workshopId: string
  productionLineId: string
  suffix: string
  shipmentApproverUsername: string
  shipmentApproverPassword: string
}
type Api = {
  post<T>(path: string, data: unknown, idempotent?: boolean): Promise<T>
  get<T>(path: string): Promise<T>
}

const backend = process.env.GARMENT_E2E_EXTERNAL_BACKEND_URL ?? 'http://127.0.0.1:18080/api/v1'
const quantity = '10.000000'
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

async function uploadEvidence(
  page: Page,
  input: ReturnType<Page['locator']>,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await input.setInputFiles(file)
    const row = page.locator('.upload-ledger li').filter({ hasText: file.name })
    await expect(row).toBeVisible()
    await expect
      .poll(async () => {
        const text = (await row.textContent()) ?? ''
        if (text.includes('SHA-256')) return 'ready'
        if (text.includes('证据存储暂不可用')) return 'retryable'
        return 'pending'
      })
      .not.toBe('pending')
    const text = (await row.textContent()) ?? ''
    if (text.includes('SHA-256')) return
    if (!text.includes('证据存储暂不可用') || attempt === 3) {
      await expect(row).toContainText('SHA-256')
      return
    }
    await row.getByRole('button', { name: '移除' }).click()
    await expect(row).toHaveCount(0)
    await expect(input).toBeEnabled()
  }
}

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

async function login(
  page: Page,
  username = 'admin',
  password = process.env.GARMENT_E2E_DEMO_PASSWORD ?? 'DemoOnly!123',
): Promise<string> {
  await page.goto('/login')
  await page.getByLabel('工厂租户代码').fill('demo')
  await page.getByLabel('工号 / 账号').fill(username)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '进入工厂控制台' }).click()
  await expect(page.getByRole('heading', { name: '订单履约控制塔' })).toBeVisible()
  return page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}') as { token?: string }
    return session.token ?? ''
  })
}

async function approveShipmentInIndependentBrowserSession(
  browser: Browser,
  fixture: Fixture,
  orderId: string,
  shipmentId: string,
): Promise<void> {
  const context = await browser.newContext()
  try {
    const approverPage = await context.newPage()
    await login(approverPage, fixture.shipmentApproverUsername, fixture.shipmentApproverPassword)
    await approverPage.goto(`/shipments/${orderId}`)
    const approve = approverPage.getByTestId(`approve-${shipmentId}`)
    await expect(approve).toBeVisible()
    await approve.click()
    await expect(approverPage.getByTestId(`dispatch-${shipmentId}`)).toBeVisible()
  } finally {
    await context.close()
  }
}

function api(page: Page, token: string): Api {
  return {
    async post<T>(path: string, data: unknown, idempotent = true): Promise<T> {
      return responseData<T>(
        await page.request.post(`${backend}${path}`, {
          data,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(idempotent ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
          },
        }),
      )
    },
    async get<T>(path: string): Promise<T> {
      return responseData<T>(
        await page.request.get(`${backend}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
    },
  }
}

async function prepareReleasedWorkOrder(client: Api): Promise<{
  fixture: Fixture
  order: Entity & { items: Entity[] }
  workOrder: Entity
}> {
  const fixture = await client.post<Fixture>('/test-support/reset', {}, false)
  const order = await client.post<Entity & { items: Entity[] }>('/sales-orders', {
    orderNo: `E2E-SLICE-B-${fixture.suffix}`,
    customerId: fixture.customerId,
    orderDate: isoDate(0),
    items: [
      {
        productId: fixture.productId,
        skuId: fixture.skuId,
        color: '黑色',
        size: 'M',
        fit: '常规',
        quantity: 10,
        deliveryDate: isoDate(30),
        specialProcess: 'Slice-B 全链路',
        unitPrice: '100.0000',
      },
    ],
  })
  const act = (path: string, current: Entity) =>
    client.post<Entity>(path, { version: current.version })
  const submitted = await act(`/sales-orders/${order.id}/submit`, order)
  await act(`/sales-orders/${order.id}/approve`, submitted)
  const orderItemId = order.items[0]!.id
  type PlanBranch = Entity & {
    materialType: 'FABRIC' | 'ACCESSORY'
    items: Array<Entity & { materialId: string }>
  }
  const procurement = await client.get<{ branches: PlanBranch[] }>(
    `/procurement/orders/${order.id}`,
  )
  const lots: Partial<Record<PlanBranch['materialType'], string>> = {}
  for (const branch of procurement.branches) {
    const planSubmitted = await act(`/purchase-plans/${branch.id}/submit`, branch)
    await act(`/purchase-plans/${branch.id}/approve`, planSubmitted)
    const purchase = await client.post<Entity & { items: Entity[] }>('/purchase-orders', {
      orderNo: `E2E-B-${branch.materialType}-${fixture.suffix}`,
      supplierId: fixture.supplierId,
      purchasePlanId: branch.id,
      items: [
        {
          purchasePlanItemId: branch.items[0]!.id,
          orderedQuantity: quantity,
          overReceiptLimit: '0.000000',
        },
      ],
    })
    const purchaseSubmitted = await act(`/purchase-orders/${purchase.id}/submit`, purchase)
    const purchaseApproved = await act(`/purchase-orders/${purchase.id}/approve`, purchaseSubmitted)
    await act(`/purchase-orders/${purchase.id}/place`, purchaseApproved)
    const supplierBatch = `E2E-B-${branch.materialType}-${fixture.suffix}`
    lots[branch.materialType] = supplierBatch
    const receipt = await client.post<Entity & { items: Entity[] }>('/receipts', {
      receiptNo: `E2E-B-REC-${branch.materialType}-${fixture.suffix}`,
      purchaseOrderId: purchase.id,
      items: [
        {
          purchaseOrderItemId: purchase.items[0]!.id,
          supplierBatch,
          quantity,
        },
      ],
    })
    const inspection = await client.post<Entity & { items: Entity[] }>('/incoming-inspections', {
      inspectionNo: `E2E-B-IQC-${branch.materialType}-${fixture.suffix}`,
      receiptId: receipt.id,
      items: [
        {
          receiptItemId: receipt.items[0]!.id,
          inspectedQuantity: quantity,
          passedQuantity: quantity,
          rejectedQuantity: '0.000000',
          defectNote: '',
        },
      ],
    })
    await act(`/incoming-inspections/${inspection.id}/finish`, inspection)
    const putAway = await client.post<Entity>('/put-away-orders', {
      putAwayNo: `E2E-B-PA-${branch.materialType}-${fixture.suffix}`,
      inspectionId: inspection.id,
      warehouseId: fixture.warehouseId,
      items: [{ inspectionItemId: inspection.items[0]!.id, quantity }],
    })
    await act(`/put-away-orders/${putAway.id}/complete`, putAway)
    await act(
      `/incoming-inspections/${inspection.id}/complete`,
      await client.get<Entity>(`/incoming-inspections/${inspection.id}`),
    )
    await act(
      `/purchase-orders/${purchase.id}/complete`,
      await client.get<Entity>(`/purchase-orders/${purchase.id}`),
    )
    await act(
      `/purchase-plans/${branch.id}/complete`,
      await client.get<Entity>(`/purchase-plans/${branch.id}`),
    )
  }

  const issue = async (kind: 'FABRIC' | 'ACCESSORY', materialId: string) =>
    (
      await client.post<{ issue: Entity }>('/material-issues', {
        issueNo: `E2E-B-ISS-${kind}-${fixture.suffix}`,
        orderItemId,
        warehouseId: fixture.warehouseId,
        materialId,
        materialType: kind,
        batchNo: lots[kind],
        quantity,
      })
    ).issue
  const fabricIssue = await issue('FABRIC', fixture.fabricMaterialId)
  await issue('ACCESSORY', fixture.accessoryMaterialId)
  let cutting = await client.post<Entity>('/cutting-orders', {
    cuttingNo: `E2E-B-CUT-${fixture.suffix}`,
    materialIssueId: fabricIssue.id,
    orderItemId,
    skuId: fixture.skuId,
    productionBatch: `CUT-B-${fixture.suffix}`,
    sourceFabricLot: lots.FABRIC,
    inputQuantity: quantity,
  })
  cutting = await client.post<Entity>(
    `/cutting-orders/${cutting.id}/release`,
    { version: cutting.version },
    false,
  )
  cutting = await client.post<Entity>(
    `/cutting-orders/${cutting.id}/start`,
    { version: cutting.version },
    false,
  )
  await client.post<Entity>(`/cutting-orders/${cutting.id}/complete`, {
    outputQuantity: quantity,
    lossQuantity: '0.000000',
    excessReturnQuantity: '0.000000',
    bundles: [{ bundleNo: `B-BUNDLE-${fixture.suffix}`, quantity }],
    returnNo: null,
    version: cutting.version,
  })
  const kitting = await client.post<Entity>(
    '/kitting-checks',
    {
      orderItemId,
      skuId: fixture.skuId,
    },
    false,
  )
  const release = await client.post<Entity>(`/kitting-checks/${kitting.id}/releases`, { quantity })
  const plan = await client.post<Entity & { items: Array<{ schedule: Entity }> }>(
    '/production-plans',
    {
      orderId: order.id,
      orderItemId,
      skuId: fixture.skuId,
      kittingReleaseId: release.id,
      factoryId: fixture.factoryId,
      workshopId: fixture.workshopId,
      productionLineId: fixture.productionLineId,
      quantity,
      startDate: isoDate(1),
      endDate: isoDate(7),
      plannedBatchCode: `SLICE-B-${fixture.suffix}`,
    },
  )
  const approvedPlan = await client.post<typeof plan>(
    `/production-plans/${plan.id}/approve`,
    {
      version: plan.version,
    },
    false,
  )
  let workOrder = await client.post<Entity>('/work-orders/from-schedule', {
    productionScheduleId: approvedPlan.items[0]!.schedule.id,
  })
  workOrder = await act(`/work-orders/${workOrder.id}/submit`, workOrder)
  workOrder = await act(`/work-orders/${workOrder.id}/approve`, workOrder)
  workOrder = await act(`/work-orders/${workOrder.id}/release`, workOrder)
  return { fixture, order, workOrder }
}

test('slice B: production report through after-sales observation closes the order', async ({
  browser,
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('narrow'), 'Business slice runs once on desktop')
  test.setTimeout(240_000)
  const token = await login(page)
  expect(token).not.toBe('')
  const anonymousAdvance = await page.request.post(`${backend}/test-support/advance-clock`, {
    data: { days: 1 },
  })
  expect(anonymousAdvance.status()).toBe(401)
  const client = api(page, token)
  const { fixture, order, workOrder } = await prepareReleasedWorkOrder(client)

  await test.step('生产报工、自检失败、纠正和新冻结图片版本', async () => {
    await page.goto(`/work-orders/${workOrder.id}`)
    await page.locator('[name="inputQuantity"]').fill(quantity)
    await page.locator('[name="goodQuantity"]').fill(quantity)
    await page.locator('[name="defectQuantity"]').fill('0.000000')
    await page.locator('[name="reworkInputQuantity"]').fill('0.000000')
    await page.locator('[name="closingWorkInProgressQuantity"]').fill('0.000000')
    await page.locator('[name="operator"]').fill('E2E 操作员')
    await page.locator('[name="team"]').fill('A 班')
    await page.locator('[name="workHours"]').fill('8.000000')
    await page.locator('[name="equipment"]').fill('E2E-01')
    await page.getByRole('button', { name: '提交报工' }).click()
    await expect(page.getByText('累计良品').locator('..').getByText(quantity)).toBeVisible()

    const completionButton = page.getByTestId('completion-form').getByRole('button')
    await expect(page.getByText('尚无可选择的过程初检')).toBeVisible()
    await expect(completionButton).toBeDisabled()

    const file = page.locator('.evidence-uploader input[type=file]')
    await uploadEvidence(page, file, {
      name: 'self-check-v1.png',
      mimeType: 'image/png',
      buffer: png,
    })
    await page.getByLabel('判定').selectOption('FAILED')
    await page.locator('[name="inspector"]').fill('一检员')
    await page.getByTestId('inspection-submit').click()
    await expect(page.getByText(/未通过 · V1/)).toBeVisible()
    await page.getByPlaceholder('说明设备、工艺或人员纠正措施').fill('重新调整设备张力并复核首件')
    await page.getByRole('button', { name: '登记纠正' }).click()
    await page.getByRole('button', { name: '确认纠正完成' }).click()
    await expect(file).toBeEnabled()
    const revisedPng = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const context = canvas.getContext('2d')!
        context.fillStyle = '#2f766b'
        context.fillRect(0, 0, 1, 1)
        return canvas.toDataURL('image/png').split(',')[1]!
      }),
      'base64',
    )
    await uploadEvidence(page, file, {
      name: 'self-check-v2.png',
      mimeType: 'image/png',
      buffer: revisedPng,
    })
    await page.getByLabel('判定').selectOption('PASSED')
    await page.locator('[name="inspector"]').fill('复检员')
    await page.getByTestId('inspection-submit').click()
    await expect(page.getByText(/已通过 · V2/)).toBeVisible()
    await page.getByTestId('completion-form').getByRole('button').click()
    await expect(page.getByText('良品范围已完整覆盖，工单进入待完工')).toBeVisible()
  })

  let packingInspections: Array<{ id: string; passedQuantity: string }> = []
  await test.step('剪线、唯一正式成品质检和返工后新批次', async () => {
    await page.goto('/quality')
    await page.locator('[name="salesOrderId"]').fill(order.id)
    await page.getByTestId('load-quality').getByRole('button').click()
    await expect(page.getByText('唯一正式成品质检')).toBeVisible()
    await page.locator('[name="trimQuantity"]').fill(quantity)
    await page.getByTestId('trim-submit').click()
    await expect(page.getByText(`后整 ${quantity}`)).toBeVisible()
    await page.locator('[name="inspectionMethod"]').selectOption('FULL')
    await page.locator('[name="submittedQuantity"]').fill(quantity)
    await page.locator('[name="passedQuantity"]').fill('8.000000')
    await page.locator('[name="failedQuantity"]').fill('2.000000')
    await page.locator('[name="defectCode"]').fill('STITCH')
    await page.locator('[name="disposition"]').fill('返工后回检')
    await page.getByTestId('inspection-submit').click()
    await page.locator('[name="reworkPassedQuantity"]').fill('2.000000')
    await page.locator('[name="reworkFailedQuantity"]').fill('0.000000')
    await page.locator('[name="reworkDisposition"]').fill('返工通过')
    await page.getByTestId('rework-submit').click()
    await expect(page.getByText('正式通过 / 待返工').locator('..').locator('strong')).toHaveText(
      quantity,
    )
    const facts = await client.get<{
      passedQuantity: string
      inspections: Array<{
        id: string
        type: string
        inspectionVersion: number
        sourceInspectionId: string | null
        passedQuantity: string
      }>
    }>(`/quality/work-orders/${workOrder.id}`)
    expect(facts.passedQuantity).toBe(quantity)
    expect(new Set(facts.inspections.map((item) => item.type))).toEqual(
      new Set(['FINISHED_PRODUCT']),
    )
    expect(
      facts.inspections.some((item) => item.inspectionVersion === 2 && item.sourceInspectionId),
    ).toBeTruthy()
    packingInspections = facts.inspections
      .filter((item) => item.passedQuantity !== '0.000000')
      .sort((left, right) => left.inspectionVersion - right.inspectionVersion)
  })

  await test.step('装箱、独立审批、发运和签收', async () => {
    await page.goto(`/shipments/${order.id}`)
    for (const [index, inspection] of packingInspections.entries()) {
      await page.getByLabel('箱号').fill(`BOX-${fixture.suffix}-${index + 1}`)
      await page.getByLabel('质检批次 ID').fill(inspection.id)
      await page.getByLabel('装箱数量').fill(inspection.passedQuantity)
      await page.getByRole('button', { name: '确认装箱' }).click()
      const expectedPacked = index === packingInspections.length - 1 ? quantity : '8.000000'
      await expect(page.getByText(`已装箱 ${expectedPacked}`)).toBeVisible()
    }
    const boxes = (
      await client.get<{
        boxes: Array<{ lines: Array<{ id: string; quantity: string }> }>
      }>(`/shipment/orders/${order.id}`)
    ).boxes
    for (const line of boxes.flatMap((box) => box.lines)) {
      await page.getByTestId(`shipment-select-${line.id}`).check()
      await page.getByTestId(`shipment-quantity-${line.id}`).fill(line.quantity)
    }
    await page.getByTestId('create-shipment').click()
    await expect(page.locator('[data-testid^="request-shipment-"]')).toHaveCount(1)
    type ShipmentWorkspace = {
      shipments: Array<Entity & { lines: Array<Entity & { plannedQuantity: string }> }>
    }
    let workspace = await client.get<ShipmentWorkspace>(`/shipment/orders/${order.id}`)
    const shipment = workspace.shipments[0]!
    await page.getByTestId(`request-shipment-${shipment.id}`).click()
    await expect(page.getByTestId(`self-approval-blocked-${shipment.id}`)).toBeVisible()
    await approveShipmentInIndependentBrowserSession(browser, fixture, order.id, shipment.id)
    await page.reload()
    workspace = await client.get<ShipmentWorkspace>(`/shipment/orders/${order.id}`)
    const approved = workspace.shipments[0]!
    for (const line of approved.lines) {
      await page.getByTestId(`progress-${line.id}`).fill(line.plannedQuantity)
    }
    await page.getByTestId(`dispatch-${approved.id}`).click()
    await expect(page.getByTestId(`sign-${approved.id}`)).toBeVisible()
    workspace = await client.get<ShipmentWorkspace>(`/shipment/orders/${order.id}`)
    const dispatched = workspace.shipments[0]!
    for (const line of dispatched.lines) {
      await page.getByTestId(`progress-${line.id}`).fill(line.plannedQuantity)
    }
    await page.getByTestId(`sign-${dispatched.id}`).click()
    const signedCard = page
      .getByRole('heading', { name: `发运单 ${dispatched.id}` })
      .locator('..')
      .locator('..')
    await expect(signedCard).toContainText('SIGNED')
    await expect(signedCard).toContainText('签收 8.000000 / 8.000000')
    await expect(signedCard).toContainText('签收 2.000000 / 2.000000')
  })

  await test.step('售后返工闭环、观察期拒绝和最终关单', async () => {
    await page.getByTestId('after-sales-source').selectOption({ index: 1 })
    await page.getByTestId('after-sales-quantity').fill('2.000000')
    await page.getByTestId('after-sales-reason').fill('CUSTOMER_REWORK')
    await page.getByTestId('after-sales-feedback').fill('客户反馈需要返工后补发')
    await page.getByTestId('create-after-sales').click()
    await expect(
      page.getByRole('link', { name: /CUSTOMER_REWORK · CREATED · 2\.000000/ }),
    ).toBeVisible()
    const afterSales = (
      await client.get<{ afterSalesCases: Entity[] }>(`/shipment/orders/${order.id}`)
    ).afterSalesCases[0]!
    await page.goto(`/after-sales/${afterSales.id}`)
    await page.getByLabel('承运商').fill('E2E 逆向物流')
    await page.getByLabel('退货运单号').fill(`RT-${fixture.suffix}`)
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('确认收货并隔离')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('开始下一轮返工')
    await page.getByLabel('返工数量').fill('2.000000')
    await page.getByLabel('返工说明').fill('拆线重做')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('完成当前轮返工')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('提交独立复检')
    await page.getByLabel('送检数量').fill('2.000000')
    await page.getByLabel('合格数量', { exact: true }).fill('2.000000')
    await page.getByLabel('不合格数量').fill('0.000000')
    await page.getByLabel('处置结论').fill('售后返工复检通过')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('创建重新装箱')
    await page.getByLabel('新箱号').fill(`REBOX-${fixture.suffix}`)
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('创建补发发运单')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByText(/补发发运单 [0-9a-f-]{36}/)).toBeVisible()
    const caseView = await client.get<{ reshipmentId: string }>(`/after-sales/${afterSales.id}`)
    const reshipmentId = caseView.reshipmentId
    await page.getByRole('link', { name: '进入发运审批工作台' }).click()
    await page.getByTestId(`request-shipment-${reshipmentId}`).click()
    await expect(page.getByTestId(`self-approval-blocked-${reshipmentId}`)).toBeVisible()
    await approveShipmentInIndependentBrowserSession(browser, fixture, order.id, reshipmentId)
    await page.reload()
    const reshipment = await client.get<Entity & { lines: Entity[] }>(`/shipments/${reshipmentId}`)
    for (const line of reshipment.lines) {
      await page.getByTestId(`progress-${line.id}`).fill('2.000000')
    }
    await page.getByTestId(`dispatch-${reshipmentId}`).click()
    await expect(page.getByTestId(`sign-${reshipmentId}`)).toBeVisible()
    for (const line of reshipment.lines) {
      await page.getByTestId(`progress-${line.id}`).fill('2.000000')
    }
    await page.getByTestId(`sign-${reshipmentId}`).click()
    const signedReshipmentCard = page
      .getByRole('heading', { name: `发运单 ${reshipmentId}` })
      .locator('..')
      .locator('..')
    await expect(signedReshipmentCard).toContainText('SIGNED')
    await page.goto(`/after-sales/${afterSales.id}`)
    await expect(page.getByTestId('after-sales-next-action')).toHaveText('确认售后结清')
    await page.getByTestId('after-sales-next-action').click()
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible()

    await page.goto(`/orders/${order.id}`)
    await expect
      .poll(() =>
        client.get<{
          observationPeriodEnded: boolean
          allShipmentsSigned: boolean
          allExceptionsClosed: boolean
        }>(`/shipment/orders/${order.id}`),
      )
      .toMatchObject({
        observationPeriodEnded: false,
        allShipmentsSigned: true,
        allExceptionsClosed: true,
      })
    await page.reload()
    await page.getByTestId('close-order').click()
    await expect(page.getByRole('alert')).toContainText('当前业务状态不允许该操作')
    await client.post('/test-support/advance-clock', { days: 7 }, false)
    await login(page)
    await page.goto(`/orders/${order.id}`)
    await page.getByTestId('close-order').click()
    await expect(page.getByText('订单已完成')).toBeVisible()
  })
})
