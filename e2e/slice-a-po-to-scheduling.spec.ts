import { expect, test, type APIResponse } from '@playwright/test'

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
}

const backend = 'http://127.0.0.1:18080/api/v1'
const decimalQuantity = '10.000000'

function isoDate(offsetDays: number): string {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + offsetDays)
  return value.toISOString().slice(0, 10)
}

async function responseData<T>(response: APIResponse): Promise<T> {
  const text = await response.text()
  expect(response.ok(), text).toBeTruthy()
  const envelope = JSON.parse(text) as { data: T }
  return envelope.data
}

test('slice A: PO through full kitting creates and approves a manual production schedule', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('narrow'), 'Business slice runs once on desktop')
  test.setTimeout(120_000)

  const anonymousReset = await page.request.post(`${backend}/test-support/reset`, { data: {} })
  expect(anonymousReset.status()).toBe(401)

  await page.goto('/login')
  await page.getByLabel('工厂租户代码').fill('demo')
  await page.getByLabel('工号 / 账号').fill('admin')
  await page.getByLabel('密码').fill('DemoOnly!123')
  await page.getByRole('button', { name: '进入工厂控制台' }).click()
  await expect(page.getByRole('heading', { name: '订单履约控制塔' })).toBeVisible()

  const token = await page.evaluate(() => {
    const session = JSON.parse(sessionStorage.getItem('garment.auth') ?? '{}') as {
      token?: string
    }
    return session.token ?? ''
  })
  expect(token).not.toBe('')

  const post = async <T>(path: string, data: unknown, idempotent = true): Promise<T> =>
    responseData<T>(
      await page.request.post(`${backend}${path}`, {
        data,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(idempotent ? { 'Idempotency-Key': crypto.randomUUID() } : {}),
        },
      }),
    )
  const get = async <T>(path: string): Promise<T> =>
    responseData<T>(
      await page.request.get(`${backend}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    )
  const act = (path: string, current: Entity) => post<Entity>(path, { version: current.version })

  const fixture = await post<Fixture>('/test-support/reset', {}, false)
  const suffix = fixture.suffix
  const order = await post<Entity & { items: Entity[] }>('/sales-orders', {
    orderNo: `E2E-PO-${suffix}`,
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
        specialProcess: 'E2E 锁边',
        unitPrice: '100.0000',
      },
    ],
  })
  const submitted = await act(`/sales-orders/${order.id}/submit`, order)
  const approvedOrder = await act(`/sales-orders/${order.id}/approve`, submitted)
  expect(approvedOrder.status).toBe('APPROVED')
  const orderItemId = order.items[0]?.id
  expect(orderItemId).toBeTruthy()

  type PlanBranch = Entity & {
    materialType: 'FABRIC' | 'ACCESSORY'
    items: Array<Entity & { materialId: string }>
  }
  const workspace = await get<{ branches: PlanBranch[] }>(`/procurement/orders/${order.id}`)
  expect(workspace.branches.map((branch) => branch.materialType).sort()).toEqual([
    'ACCESSORY',
    'FABRIC',
  ])

  const inventoryBatches: Partial<Record<PlanBranch['materialType'], string>> = {}
  for (const branch of workspace.branches) {
    const planSubmitted = await act(`/purchase-plans/${branch.id}/submit`, branch)
    await act(`/purchase-plans/${branch.id}/approve`, planSubmitted)
    const purchase = await post<Entity & { items: Entity[] }>('/purchase-orders', {
      orderNo: `E2E-BUY-${branch.materialType}-${suffix}`,
      supplierId: fixture.supplierId,
      purchasePlanId: branch.id,
      items: [
        {
          purchasePlanItemId: branch.items[0]?.id,
          orderedQuantity: decimalQuantity,
          overReceiptLimit: '0.000000',
        },
      ],
    })
    const purchaseSubmitted = await act(`/purchase-orders/${purchase.id}/submit`, purchase)
    const purchaseApproved = await act(`/purchase-orders/${purchase.id}/approve`, purchaseSubmitted)
    const placed = await act(`/purchase-orders/${purchase.id}/place`, purchaseApproved)
    const supplierBatch = `E2E-${branch.materialType}-LOT-${suffix}`
    inventoryBatches[branch.materialType] = supplierBatch
    const receipt = await post<Entity & { items: Entity[] }>('/receipts', {
      receiptNo: `E2E-REC-${branch.materialType}-${suffix}`,
      purchaseOrderId: purchase.id,
      items: [
        {
          purchaseOrderItemId: purchase.items[0]?.id,
          supplierBatch,
          quantity: decimalQuantity,
        },
      ],
    })
    const inspection = await post<Entity & { items: Entity[] }>('/incoming-inspections', {
      inspectionNo: `E2E-IQC-${branch.materialType}-${suffix}`,
      receiptId: receipt.id,
      items: [
        {
          receiptItemId: receipt.items[0]?.id,
          inspectedQuantity: decimalQuantity,
          passedQuantity: decimalQuantity,
          rejectedQuantity: '0.000000',
          defectNote: '',
        },
      ],
    })
    const finished = await act(`/incoming-inspections/${inspection.id}/finish`, inspection)
    const putAway = await post<Entity>('/put-away-orders', {
      putAwayNo: `E2E-PA-${branch.materialType}-${suffix}`,
      inspectionId: inspection.id,
      warehouseId: fixture.warehouseId,
      items: [
        {
          inspectionItemId: inspection.items[0]?.id,
          quantity: decimalQuantity,
        },
      ],
    })
    const completedPutAway = await act(`/put-away-orders/${putAway.id}/complete`, putAway)
    expect(completedPutAway.status).toBe('COMPLETED')
    const refreshedInspection = await get<Entity>(`/incoming-inspections/${inspection.id}`)
    const completedInspection = await act(
      `/incoming-inspections/${inspection.id}/complete`,
      refreshedInspection,
    )
    expect(completedInspection.status).toBe('COMPLETED')
    const refreshedPurchase = await get<Entity>(`/purchase-orders/${purchase.id}`)
    const completedPurchase = await act(
      `/purchase-orders/${purchase.id}/complete`,
      refreshedPurchase,
    )
    expect(completedPurchase.status).toBe('COMPLETED')
    const refreshedPlan = await get<Entity>(`/purchase-plans/${branch.id}`)
    const completedPlan = await act(`/purchase-plans/${branch.id}/complete`, refreshedPlan)
    expect(completedPlan.status).toBe('COMPLETED')
    expect(placed.status).toBe('ORDERED')
    expect(finished.status).toBe('PASSED')
  }

  const issueMaterial = async (
    materialType: 'FABRIC' | 'ACCESSORY',
    materialId: string,
  ): Promise<Entity> => {
    const result = await post<{ issue: Entity }>('/material-issues', {
      issueNo: `E2E-ISS-${materialType}-${suffix}`,
      orderItemId,
      warehouseId: fixture.warehouseId,
      materialId,
      materialType,
      batchNo: inventoryBatches[materialType],
      quantity: decimalQuantity,
    })
    return result.issue
  }
  const fabricIssue = await issueMaterial('FABRIC', fixture.fabricMaterialId)
  await issueMaterial('ACCESSORY', fixture.accessoryMaterialId)

  let cutting = await post<Entity>('/cutting-orders', {
    cuttingNo: `E2E-CUT-${suffix}`,
    materialIssueId: fabricIssue.id,
    orderItemId,
    skuId: fixture.skuId,
    productionBatch: `CUT-${suffix}`,
    sourceFabricLot: inventoryBatches.FABRIC,
    inputQuantity: decimalQuantity,
  })
  cutting = await post<Entity>(
    `/cutting-orders/${cutting.id}/release`,
    {
      version: cutting.version,
    },
    false,
  )
  cutting = await post<Entity>(
    `/cutting-orders/${cutting.id}/start`,
    {
      version: cutting.version,
    },
    false,
  )
  cutting = await post<Entity>(`/cutting-orders/${cutting.id}/complete`, {
    outputQuantity: decimalQuantity,
    lossQuantity: '0.000000',
    excessReturnQuantity: '0.000000',
    bundles: [{ bundleNo: `BUNDLE-${suffix}`, quantity: decimalQuantity }],
    returnNo: null,
    version: cutting.version,
  })
  expect(cutting.status).toBe('COMPLETED')

  const kitting = await post<
    Entity & {
      fabricReadyQuantity: string
      accessoryReadyQuantity: string
      overallReadyQuantity: string
    }
  >('/kitting-checks', { orderItemId, skuId: fixture.skuId }, false)
  expect(kitting.fabricReadyQuantity).toBe(decimalQuantity)
  expect(kitting.accessoryReadyQuantity).toBe(decimalQuantity)
  expect(kitting.overallReadyQuantity).toBe(decimalQuantity)
  const release = await post<Entity>(`/kitting-checks/${kitting.id}/releases`, {
    quantity: decimalQuantity,
  })

  const plannedBatch = `PLAN-${suffix}`
  await page.goto('/production')
  await page.getByLabel('订单 ID').fill(order.id)
  await page.getByLabel('订单项 ID').fill(orderItemId ?? '')
  await page.getByLabel('SKU ID').fill(fixture.skuId)
  await page.getByLabel('齐套释放 ID').fill(release.id)
  await page.getByLabel('工厂 ID').fill(fixture.factoryId)
  await page.getByLabel('车间 ID').fill(fixture.workshopId)
  await page.getByLabel('产线 ID').fill(fixture.productionLineId)
  await page.getByLabel('排产数量').fill(decimalQuantity)
  await page.getByLabel('计划批次').fill(plannedBatch)
  await page.getByLabel('开始日期').fill(isoDate(1))
  await page.getByLabel('结束日期').fill(isoDate(7))
  await page.getByRole('button', { name: '创建排产草案' }).click()

  await expect(page.getByText('待审批', { exact: true })).toBeVisible()
  await expect(page.getByText('仅已审批排程可下推工单', { exact: true })).toBeVisible()
  await expect(page.getByText(plannedBatch, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '审批并签发排程' }).click()
  await expect(page.getByText('已审批', { exact: true })).toBeVisible()
  await expect(page.getByText('工单门已开启', { exact: true })).toBeVisible()
})
