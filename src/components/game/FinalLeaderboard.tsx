import React from 'react'
import type { LivePlayer } from '@/server/game/types'
import { RankMotion } from './RankMotion'

export function FinalLeaderboard({ players }: { players: LivePlayer[] }) {
  return <section className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 p-6 text-center text-white">
    <p className="text-xl font-bold">เกมจบแล้ว!</p><h1 className="text-5xl font-black">อันดับสุดท้าย</h1>
    <RankMotion players={players} />
  </section>
}
