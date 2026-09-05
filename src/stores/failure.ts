export interface RequestFailure {
  message: string
  traceId: string
}

export function emptyFailure(): RequestFailure {
  return { message: '', traceId: '' }
}

export function toFailure(error: unknown, fallback: string): RequestFailure {
  const candidate = error as { message?: string; traceId?: string }
  return {
    message: candidate.message || fallback,
    traceId: candidate.traceId || '',
  }
}
