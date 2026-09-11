import { describe, expect, it } from 'vitest'
import {
  formatDateTime,
  formatQuantity,
  formatStatus,
  isCompletedStatus,
  shortReference,
} from './presentation'

describe('presentation helpers', () => {
  it('removes meaningless decimal zeroes', () => {
    expect(formatQuantity('10.000000')).toBe('10')
    expect(formatQuantity('12.360000')).toBe('12.36')
  })

  it('localizes domain statuses', () => {
    expect(formatStatus('AFTER_SALES_OBSERVATION')).toBe('售后观察')
    expect(formatStatus('SIGNED')).toBe('已签收')
  })

  it('formats timestamps in the tenant timezone', () => {
    expect(formatDateTime('2026-09-11T02:27:48.764058Z')).toBe('2026-09-11 10:27')
  })

  it('keeps technical references secondary and scannable', () => {
    expect(shortReference('762ee19e-af82-4559-b7e0-c7015ac2637d')).toBe('762ee19e…')
    expect(isCompletedStatus('PASSED')).toBe(true)
  })
})
