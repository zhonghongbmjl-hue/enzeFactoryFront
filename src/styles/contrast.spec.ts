import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8')
const layoutCss = readFileSync(resolve(process.cwd(), 'src/styles/layout-system.css'), 'utf8')

function token(name: string): string {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match?.[1]) throw new Error(`Missing solid color token --${name}`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((value) => Number.parseInt(value, 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
  if (!channels || channels.length !== 3) throw new Error(`Invalid color ${hex}`)
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(foreground: string, background: string): number {
  const first = luminance(foreground)
  const second = luminance(background)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

describe('small text contrast tokens', () => {
  it.each([
    ['text-note-on-fabric', 'fabric-50'],
    ['text-secondary-on-fabric', 'fabric-50'],
    ['text-muted-on-fabric', 'fabric-50'],
    ['text-label-on-fabric', 'fabric-50'],
    ['text-code-on-fabric', 'fabric-50'],
    ['text-muted-on-ink', 'ink-900'],
    ['text-accent-on-ink', 'ink-900'],
    ['text-accent-on-fabric', 'fabric-50'],
  ])('%s is WCAG AA on %s', (foreground, background) => {
    expect(contrast(token(foreground), token(background))).toBeGreaterThanOrEqual(4.5)
  })

  it('does not restyle header actions by coloring every span', () => {
    expect(layoutCss).not.toMatch(/header:first-child :is\(h1, h2, p, span\)/)
  })
})
