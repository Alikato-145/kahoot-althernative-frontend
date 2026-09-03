'use client'

import React from 'react'
import { useEffect, useState } from 'react'

export function timeBarProgress(openedAt: number, deadlineAt: number, now = Date.now()): number {
  const duration = deadlineAt - openedAt
  if (duration <= 0) return 0
  return Math.max(0, Math.min(100, ((deadlineAt - now) / duration) * 100))
}

function secondsUntil(deadlineAt: number): number { return Math.max(0, Math.ceil((deadlineAt - Date.now()) / 1000)) }

/** Kahoot-style countdown that derives progress from server timestamps. */
export function TimeBar({ openedAt, deadlineAt }: { openedAt: number; deadlineAt: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { setNow(Date.now()); const interval = window.setInterval(() => setNow(Date.now()), 100); return () => window.clearInterval(interval) }, [openedAt, deadlineAt])
  const seconds = Math.max(0, Math.ceil((deadlineAt - now) / 1000))
  const minutes = Math.floor(seconds / 60).toString().padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return <div className="time-bar" role="timer" aria-label={`เหลือเวลา ${seconds} วินาที`}>
    <div className="time-bar__track"><div className="time-bar__fill" style={{ width: `${timeBarProgress(openedAt, deadlineAt, now)}%` }} /></div>
    <time dateTime={`PT${secondsUntil(deadlineAt)}S`} className="time-bar__label">{minutes}:{remainder}</time>
  </div>
}
