'use client'
import React from 'react'
import type { LivePlayer } from '@/server/game/types'
export function PlayerLobby({ nickname, players }: { nickname: string; players: LivePlayer[] }) { return <section className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 p-6 text-center"><p className="text-lg text-purple-200">เข้าร่วมเกมแล้ว</p><h1 className="text-4xl font-black">สวัสดี {nickname}!</h1><p role="status" className="text-xl">รอผู้จัดเริ่มเกม…</p><p className="text-purple-200">ผู้เล่น {players.length} คน</p></section> }
