'use client'

import React from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { HostGame } from '@/components/game/HostGame'

/** Projected Host display. The capability stays in the launch URL and is never sent to Players. */
export default function HostGamePage() {
  const params = useParams<{ id: string }>()
  const hostToken = useSearchParams().get('hostToken')
  if (!hostToken) return <main className="p-8"><p role="alert">ลิงก์ผู้จัดเกมไม่ถูกต้อง</p></main>
  return <HostGame sessionId={params.id} hostToken={hostToken} />
}
