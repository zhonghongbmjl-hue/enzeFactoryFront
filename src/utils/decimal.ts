const SCALE = 6

export type DecimalString = string

export function decimalUnits(value: DecimalString): bigint {
  const normalized = value.trim()
  const match = /^(-?)(\d{1,12})(?:\.(\d{0,6}))?$/.exec(normalized)
  if (!match) throw new Error('数量必须是最多 12 位整数、6 位小数的十进制文本')
  const units = BigInt(match[2] + (match[3] || '').padEnd(SCALE, '0'))
  return match[1] === '-' ? -units : units
}

export function compareDecimal(left: DecimalString, right: DecimalString): number {
  const difference = decimalUnits(left) - decimalUnits(right)
  return difference < 0n ? -1 : difference > 0n ? 1 : 0
}

export function addDecimal(...values: DecimalString[]): DecimalString {
  return formatUnits(values.reduce((sum, value) => sum + decimalUnits(value), 0n))
}

export function isPositiveDecimal(value: DecimalString): boolean {
  try {
    return decimalUnits(value) > 0n
  } catch {
    return false
  }
}

export function decimalPercent(value: DecimalString, total: DecimalString): string {
  const denominator = decimalUnits(total)
  if (denominator <= 0n) return '0%'
  const percentTenths = (decimalUnits(value) * 1000n) / denominator
  const capped = percentTenths > 1000n ? 1000n : percentTenths < 0n ? 0n : percentTenths
  return `${capped / 10n}.${capped % 10n}%`
}

function formatUnits(value: bigint): DecimalString {
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  const raw = absolute.toString().padStart(SCALE + 1, '0')
  return `${sign}${raw.slice(0, -SCALE)}.${raw.slice(-SCALE)}`
}
