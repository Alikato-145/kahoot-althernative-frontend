import { describe, expect, it } from 'vitest'
import { timeBarProgress } from '@/components/ui/TimeBar'

describe('timeBarProgress', () => {
  it('uses the server start and deadline timestamps to shrink the bar', () => {
    expect(timeBarProgress(1_000, 11_000, 6_000)).toBe(50)
  })

  it('clamps elapsed and future values without resetting the timer', () => {
    expect(timeBarProgress(1_000, 11_000, 20_000)).toBe(0)
    expect(timeBarProgress(1_000, 11_000, 0)).toBe(100)
  })
})
