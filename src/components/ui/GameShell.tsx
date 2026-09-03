import type { ReactNode } from 'react'
import React from 'react'

export interface GameShellProps {
  children: ReactNode
  className?: string
  header?: ReactNode
}

/** Full-height stage used by host and player gameplay views. */
export function GameShell({ children, className = '', header }: GameShellProps) {
  return (
    <main className={`game-shell ${className}`.trim()}>
      {header ? <header className="game-shell__header">{header}</header> : null}
      <section className="game-shell__content">{children}</section>
    </main>
  )
}
