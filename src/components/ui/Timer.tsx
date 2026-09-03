'use client'

import { useEffect, useState } from 'react'

export interface TimerProps {
  /** Absolute deadline in milliseconds since Unix epoch. */
  deadline: number
  className?: string
}

function secondsUntil(deadline: number) {
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

export function Timer({ deadline, className = '' }: TimerProps) {
  const [seconds, setSeconds] = useState(() => secondsUntil(deadline))

  useEffect(() => {
    setSeconds(secondsUntil(deadline))
    const interval = window.setInterval(() => setSeconds(secondsUntil(deadline)), 250)
    return () => window.clearInterval(interval)
  }, [deadline])

  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return (
    <time className={`game-timer ${className}`.trim()} dateTime={`PT${seconds}S`} aria-label={`เหลือเวลา ${seconds} วินาที`}>
      {minutes}:{remainder}
    </time>
  )
}
