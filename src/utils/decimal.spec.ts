import { describe, expect, it } from 'vitest'
import {
  addDecimal,
  compareDecimal,
  decimalPercent,
  isNonNegativeDecimal,
  isPositiveDecimal,
  normalizeDecimalInput,
} from './decimal'

describe('decimal utilities', () => {
  it('accepts and preserves decimal values beyond six fractional digits', () => {
    expect(isPositiveDecimal('0.0000001')).toBe(true)
    expect(isNonNegativeDecimal('12.12345678901234567890')).toBe(true)
    expect(normalizeDecimalInput('12.1234567890123456789000')).toBe('12.1234567890123456789')
  })

  it('compares and adds values with different arbitrary scales exactly', () => {
    expect(compareDecimal('1.0000001', '1.00000001')).toBe(1)
    expect(addDecimal('0.0000001', '0.00000002')).toBe('0.00000012')
    expect(decimalPercent('0.0000001', '0.0000004')).toBe('25.0%')
  })

  it('keeps non-precision validation in place', () => {
    expect(isPositiveDecimal('not-a-number')).toBe(false)
    expect(isNonNegativeDecimal('-0.1')).toBe(false)
    expect(isNonNegativeDecimal('1234567890123.1')).toBe(false)
  })
})
