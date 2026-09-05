import type { ApiRequestClient } from '../http'
import { withIdempotency } from '../http'
import type {
  EvidenceReference,
  ProcessCorrection,
  ProcessInspectionView,
  TemporaryEvidenceUpload,
} from '@/types/production'

export function createProductionEvidenceApi(request: ApiRequestClient) {
  return {
    async upload(
      workOrderId: string,
      file: File,
      sha256: string,
      onProgress?: (percent: number) => void,
      signal?: AbortSignal,
    ): Promise<TemporaryEvidenceUpload> {
      const form = new FormData()
      form.append('file', file, file.name)
      return request.post<TemporaryEvidenceUpload>(
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
    },
    async removeTemporary(workOrderId: string, tempObjectKey: string): Promise<void> {
      await request.delete(`/work-orders/${workOrderId}/process-inspections/temp-objects`, {
        data: { tempObjectKey },
      })
    },
    async latest(workOrderId: string): Promise<ProcessInspectionView | null> {
      return request.get<ProcessInspectionView | null>(
        `/work-orders/${workOrderId}/process-inspections/latest`,
      )
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
      return request.post<ProcessInspectionView>(
        `/work-orders/${workOrderId}/process-inspections`,
        input,
        withIdempotency({ method: 'post' }, key),
      )
    },
    async createCorrection(
      workOrderId: string,
      inspectionId: string,
      description: string,
      key: string,
    ): Promise<ProcessCorrection> {
      return request.post<ProcessCorrection>(
        `/work-orders/${workOrderId}/process-inspections/${inspectionId}/corrections`,
        { description },
        withIdempotency({ method: 'post' }, key),
      )
    },
    async completeCorrection(
      workOrderId: string,
      correctionId: string,
      version: number,
      key: string,
    ): Promise<ProcessCorrection> {
      return request.post<ProcessCorrection>(
        `/work-orders/${workOrderId}/process-inspections/corrections/${correctionId}/complete`,
        { version },
        withIdempotency({ method: 'post' }, key),
      )
    },
  }
}
