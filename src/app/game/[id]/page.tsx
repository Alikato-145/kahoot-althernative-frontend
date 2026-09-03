import { PlayerGame } from '@/components/game/PlayerGame'
import React from 'react'

export default function GamePage({ params }: { params: { id: string } }) {
  return <PlayerGame pin={params.id} />
}
