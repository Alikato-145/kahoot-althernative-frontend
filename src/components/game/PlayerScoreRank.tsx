import React from 'react'

export function rankMovementCopy(previousRank: number, rank: number): string {
  if (rank < previousRank) return `ขึ้น ${previousRank - rank} อันดับ`
  if (rank > previousRank) return `ลง ${rank - previousRank} อันดับ`
  return 'อันดับคงเดิม'
}

export function PlayerScoreRank({ correct, earnedScore, totalScore, previousRank, rank }: { correct?: boolean; earnedScore: number; totalScore: number; previousRank: number; rank: number }) {
  const wasCorrect = correct ?? earnedScore > 0
  return <section aria-live="polite" className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6 text-center text-white">
    <p className="text-xl font-black">{wasCorrect ? 'ตอบถูก!' : 'ยังไม่ถูกข้อนี้'}</p>
    <p className="text-2xl font-black">ได้เพิ่ม {earnedScore.toLocaleString()} คะแนน</p>
    <p className="text-7xl font-black">อันดับ {rank}</p>
    <p className="text-2xl font-bold">{rankMovementCopy(previousRank, rank)}</p>
    <p className="text-xl">คะแนนรวม <strong>{totalScore.toLocaleString()}</strong></p>
    <p className="text-sm opacity-80">รอผู้จัดเกมไปข้อถัดไป…</p>
  </section>
}
