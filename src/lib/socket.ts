'use client'
import { io, type Socket } from 'socket.io-client'
let socket: Socket | null = null
type TestSocketFactory = () => Socket
declare global { interface Window { __campQuizSocketFactory?: TestSocketFactory } }
export function getGameSocket(): Socket { if (!socket) socket = window.__campQuizSocketFactory?.() ?? io(process.env.NEXT_PUBLIC_SOCKET_URL, { path: '/socket.io' }); return socket }
