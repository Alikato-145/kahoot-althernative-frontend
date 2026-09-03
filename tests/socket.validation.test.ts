import { describe, expect, it } from 'vitest'
import { parsePlayerJoin } from '@/server/socket'

describe('player join socket payload', () => {
  it('accepts a valid six-digit PIN and trims a valid nickname', () => {
    expect(parsePlayerJoin({ pin: '842193', nickname: ' มานัส ' })).toEqual({ pin: '842193', nickname: 'มานัส' })
  })

  it.each([
    { pin: '123', nickname: 'มานัส' },
    { pin: '842193', nickname: '' },
    { pin: '842193', nickname: '                     ' },
    { pin: '842193', nickname: 'ชื่อเล่นที่ยาวเกินกว่ายี่สิบตัวอักษร' },
  ])('rejects malformed player join input %#', (input) => {
    expect(() => parsePlayerJoin(input)).toThrow()
  })
})
