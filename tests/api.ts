export function mockApiResponse<T>(data: T) {
  return {
    data: {
      success: true,
      code: 'OK',
      message: 'success',
      data,
      traceId: 'test-trace-id',
      timestamp: '2026-09-01T00:00:00Z',
    },
  }
}
