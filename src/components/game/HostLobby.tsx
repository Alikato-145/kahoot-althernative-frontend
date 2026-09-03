'use client'

import React from 'react'
import { useQRCode } from 'next-qrcode'
import type { LivePlayer } from '@/server/game/types'

export function HostLobby({ pin, playerUrl, players, onStart }: { pin: string; playerUrl: string; players: LivePlayer[]; onStart: () => void }) {
  const { Canvas } = useQRCode()
  return <section className="grid items-center gap-10 lg:grid-cols-[1fr_auto]" aria-label="ล็อบบี้ผู้จัดเกม">
    <div className="space-y-6 text-center lg:text-left"><p className="text-xl font-bold text-purple-200">Game PIN</p><p className="font-mono text-6xl font-black tracking-[.15em] sm:text-8xl">{pin}</p><p className="text-xl">สแกน QR หรือเข้า <strong>{playerUrl}</strong></p><button type="button" className="rounded-xl bg-white px-10 py-5 text-2xl font-black text-purple-950 shadow-lg transition hover:scale-105" onClick={onStart}>เริ่มเกม</button></div>
    <div className="justify-self-center rounded-3xl bg-white p-5 text-center text-purple-950"><Canvas text={playerUrl} options={{ errorCorrectionLevel: 'M', margin: 2, scale: 7, width: 260 }} /><p className="mt-3 max-w-[260px] break-all font-semibold">{playerUrl}</p></div>
    <div className="lg:col-span-2"><h2 className="mb-3 text-2xl font-black">ผู้เล่น {players.length} คน</h2><div className="flex flex-wrap gap-3">{players.length ? players.map((player) => <span key={player.id} className="rounded-full bg-white/15 px-5 py-3 text-lg font-bold">{player.nickname}</span>) : <p className="text-purple-200">กำลังรอผู้เล่นเข้าร่วม…</p>}</div></div>
  </section>
}
