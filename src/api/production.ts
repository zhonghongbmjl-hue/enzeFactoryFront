import type { AxiosInstance } from 'axios'
import { http, withIdempotency } from './http'
import type { ApiResponse } from '@/types/auth'
import type {
  PageResponse,
  ProductionReport,
  ProductionReportInput,
  ProductionCompletion,
  ProductionCompletionInput,
  EvidenceReference,
  ProcessCorrection,
  ProcessInspectionView,
  TemporaryEvidenceUpload,
  WorkOrder,
  WorkOrderSummary,
} from '@/types/production'

export function createProductionApi(client: AxiosInstance) {
  const action = async (
    id: string,
    name: 'submit' | 'approve' | 'release',
    version: number,
    idempotencyKey?: string,
  ) =>
    (
      await client.post<ApiResponse<WorkOrder>>(
        `/work-orders/${id}/${name}`,
        { version },
        withIdempotency({ method: 'post' }, idempotencyKey),
      )
    ).data.data

  return {
    async convert(productionScheduleId: string, idempotencyKey?: string): Promise<WorkOrder> {
      return (
        await client.post<ApiResponse<WorkOrder>>(
          '/work-orders/from-schedule',
          { productionScheduleId },
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async list(page = 0, size = 20): Promise<PageResponse<WorkOrderSummary>> {
      return (
        await client.get<ApiResponse<PageResponse<WorkOrderSummary>>>('/work-orders', {
          params: { page, size },
        })
      ).data.data
    },
    async get(id: string): Promise<WorkOrder> {
      return (await client.get<ApiResponse<WorkOrder>>(`/work-orders/${id}`)).data.data
    },
    async reports(id: string, page = 0, size = 20): Promise<PageResponse<ProductionReport>> {
      return (
        await client.get<ApiResponse<PageResponse<ProductionReport>>>(
          `/work-orders/${id}/reports`,
          {
            params: { page, size },
          },
        )
      ).data.data
    },
    submit: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'submit', version, key),
    approve: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'approve', version, key),
    release: (id: string, version: number, key?: string): Promise<WorkOrder> =>
      action(id, 'release', version, key),
    async report(
      id: string,
      input: ProductionReportInput,
      idempotencyKey?: string,
    ): Promise<WorkOrder> {
      return (
        await client.post<ApiResponse<WorkOrder>>(
          `/work-orders/${id}/reports`,
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
    async complete(
      id: string,
      input: ProductionCompletionInput,
      idempotencyKey?: string,
    ): Promise<ProductionCompletion> {
      return (
        await client.post<ApiResponse<ProductionCompletion>>(
          `/work-orders/${id}/complete`,
          input,
          withIdempotency({ method: 'post' }, idempotencyKey),
        )
      ).data.data
    },
  }
}

export const productionApi = createProductionApi(http)

export const productionEvidenceApi = {
  async upload(
    workOrderId: string,
    file: File,
    sha256: string,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<TemporaryEvidenceUpload> {
    const form = new FormData()
    form.append('file', file, file.name)
    return (
      await http.post<ApiResponse<TemporaryEvidenceUpload>>(
        `/work-orders/${workOrderId}/process-inspections/temp-objects`,
        form,
        {
          headers: { 'X-Content-SHA256': sha256 },
          ...(signal ? { signal } : {}),
          onUploadProgress: (event) => {
            if (event.total && onProgress)
              onProgress(Math.round((event.loaded / event.total) * 100))
          },
        },
      )
    ).data.data
  },
  async removeTemporary(workOrderId: string, tempObjectKey: string): Promise<void> {
    await http.delete(`/work-orders/${workOrderId}/process-inspections/temp-objects`, {
      data: { tempObjectKey },
    })
  },
  async latest(workOrderId: string): Promise<ProcessInspectionView | null> {
    return (
      await http.get<ApiResponse<ProcessInspectionView | null>>(
        `/work-orders/${workOrderId}/process-inspections/latest`,
      )
    ).data.data
  },
  async submit(
    workOrderId: string,
    input: {
      result: 'PASSED' | 'FAILED'
      images: EvidenceReference[]
      inspector: string
      remarks?: string
    },
    key: string,
  ): Promise<ProcessInspectionView> {
    return (
      await http.post<ApiResponse<ProcessInspectionView>>(
        `/work-orders/${workOrderId}/process-inspections`,
        input,
        withIdempotency({ method: 'post' }, key),
      )
    ).data.data
  },
  async createCorrection(
    workOrderId: string,
    inspectionId: string,
    description: string,
    key: string,
  ): Promise<ProcessCorrection> {
    return (
      await http.post<ApiResponse<ProcessCorrection>>(
        `/work-orders/${workOrderId}/process-inspections/${inspectionId}/corrections`,
        { description },
        withIdempotency({ method: 'post' }, key),
      )
    ).data.data
  },
  async completeCorrection(
    workOrderId: string,
    correctionId: string,
    version: number,
    key: string,
  ): Promise<ProcessCorrection> {
    return (
      await http.post<ApiResponse<ProcessCorrection>>(
        `/work-orders/${workOrderId}/process-inspections/corrections/${correctionId}/complete`,
        { version },
        withIdempotency({ method: 'post' }, key),
      )
    ).data.data
  },
}
