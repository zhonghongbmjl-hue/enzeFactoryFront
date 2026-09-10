export type DecimalString = string

interface ParsedDecimal {
  coefficient: bigint
  scale: number
}

const DECIMAL_PATTERN = /^(-?)(\d{1,12})(?:\.(\d*))?$/

function parseDecimal(value: DecimalString): ParsedDecimal {
  const normalized = value.trim()
  const match = DECIMAL_PATTERN.exec(normalized)
  if (!match) throw new Error('数量必须是最多 12 位整数的十进制文本')

  const fraction = (match[3] ?? '').replace(/0+$/, '')
  const unsigned = BigInt(`${match[2]}${fraction}`)
  return {
    coefficient: match[1] === '-' ? -unsigned : unsigned,
    scale: fraction.length,
  }
}

function powerOfTen(exponent: number): bigint {
  return 10n ** BigInt(exponent)
}

function alignScale(value: ParsedDecimal, scale: number): bigint {
  return value.coefficient * powerOfTen(scale - value.scale)
}

function formatDecimal(value: ParsedDecimal): DecimalString {
  const sign = value.coefficient < 0n ? '-' : ''
  const absolute = value.coefficient < 0n ? -value.coefficient : value.coefficient
  if (value.scale === 0) return `${sign}${absolute}`

  const raw = absolute.toString().padStart(value.scale + 1, '0')
  const fraction = raw.slice(-value.scale).replace(/0+$/, '')
  return fraction
    ? `${sign}${raw.slice(0, -value.scale)}.${fraction}`
    : `${sign}${raw.slice(0, -value.scale)}`
}

export function isDecimal(value: unknown): value is DecimalString {
  if (typeof value !== 'string') return false
  try {
    parseDecimal(value)
    return true
  } catch {
    return false
  }
}

export function compareDecimal(left: DecimalString, right: DecimalString): number {
  const parsedLeft = parseDecimal(left)
  const parsedRight = parseDecimal(right)
  const scale = Math.max(parsedLeft.scale, parsedRight.scale)
  const difference = alignScale(parsedLeft, scale) - alignScale(parsedRight, scale)
  return difference < 0n ? -1 : difference > 0n ? 1 : 0
}

export function addDecimal(...values: DecimalString[]): DecimalString {
  const parsed = values.map(parseDecimal)
  const scale = parsed.reduce((maximum, value) => Math.max(maximum, value.scale), 0)
  return formatDecimal({
    coefficient: parsed.reduce((sum, value) => sum + alignScale(value, scale), 0n),
    scale,
  })
}

export function isPositiveDecimal(value: DecimalString): boolean {
  try {
    return compareDecimal(value, '0') > 0
  } catch {
    return false
  }
}

export function isNonNegativeDecimal(value: unknown): value is DecimalString {
  return typeof value === 'string' && isDecimal(value) && compareDecimal(value, '0') >= 0
}

export function normalizeDecimal(value: DecimalString): DecimalString {
  return formatDecimal(parseDecimal(value))
}

export function normalizeDecimalInput(value: DecimalString): DecimalString {
  return normalizeDecimal(value)
}

export function decimalPercent(value: DecimalString, total: DecimalString): string {
  const numerator = parseDecimal(value)
  const denominator = parseDecimal(total)
  if (denominator.coefficient <= 0n) return '0%'

  const scaledNumerator = numerator.coefficient * powerOfTen(denominator.scale) * 1000n
  const scaledDenominator = denominator.coefficient * powerOfTen(numerator.scale)
  const percentTenths = scaledNumerator / scaledDenominator
  const capped = percentTenths > 1000n ? 1000n : percentTenths < 0n ? 0n : percentTenths
  return `${capped / 10n}.${capped % 10n}%`
}
