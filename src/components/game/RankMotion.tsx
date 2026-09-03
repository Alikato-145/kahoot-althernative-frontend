'use client'

import React, { useEffect, useLayoutEffect, useRef } from 'react'

export type RankMotionPlayer = { id: string; nickname: string; score: number; rank: number }
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** The inverse transform used by FLIP when a leaderboard row changes vertical position. */
export function rankMotionTransform(previousTop: number, nextTop: number): string {
  return `translateY(${previousTop - nextTop}px)`
}

export function RankMotion({ players }: { players: RankMotionPlayer[] }) {
  const rows = useRef(new Map<string, HTMLLIElement>())
  const previousTops = useRef(new Map<string, number>())

  useIsomorphicLayoutEffect(() => {
    const nextTops = new Map<string, number>()
    for (const player of players) {
      const row = rows.current.get(player.id)
      if (!row) continue
      const nextTop = row.getBoundingClientRect().top
      const previousTop = previousTops.current.get(player.id)
      nextTops.set(player.id, nextTop)
      if (previousTop === undefined || previousTop === nextTop) continue
      row.style.transition = 'none'
      row.style.transform = rankMotionTransform(previousTop, nextTop)
      requestAnimationFrame(() => {
        row.style.transition = 'transform 500ms ease'
        row.style.transform = ''
      })
    }
    previousTops.current = nextTops
  }, [players])

  return <ol aria-label="ตารางคะแนน" className="mx-auto max-h-[60vh] w-full max-w-xl space-y-2 overflow-y-auto pr-2">
    {players.map((player) => <li key={player.id} ref={(row) => { if (row) rows.current.set(player.id, row); else rows.current.delete(player.id) }} className="flex items-center justify-between rounded-2xl bg-white/95 px-5 py-4 text-purple-950 shadow-lg">
      <span className="font-black">#{player.rank} {player.nickname}</span><span className="font-black">{player.score.toLocaleString()} คะแนน</span>
    </li>)}
  </ol>
}
