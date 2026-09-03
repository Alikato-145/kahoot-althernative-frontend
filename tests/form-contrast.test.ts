import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('form colour contrast', () => {
  it('keeps text fields readable against their white surfaces', () => {
    const stylesheet = readFileSync(resolve(process.cwd(), 'src/app/globals.css'), 'utf8')

    expect(stylesheet).toContain('input, textarea, select')
    expect(stylesheet).toMatch(/input, textarea, select\s*\{[^}]*color:\s*#241044/s)
    expect(stylesheet).toMatch(/input::placeholder, textarea::placeholder\s*\{[^}]*color:/s)
  })
})
