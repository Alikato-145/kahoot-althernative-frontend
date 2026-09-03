import type { MouseEventHandler } from 'react'
import React from 'react'

export const ANSWER_STYLES = [
  { colour: 'red', shape: 'triangle' },
  { colour: 'blue', shape: 'diamond' },
  { colour: 'yellow', shape: 'circle' },
  { colour: 'green', shape: 'square' },
] as const

export interface AnswerTileProps {
  index: number
  label: string
  onClick?: MouseEventHandler<HTMLButtonElement>
  disabled?: boolean
}

export function AnswerTile({ index, label, onClick, disabled = false }: AnswerTileProps) {
  const style = ANSWER_STYLES[index] ?? ANSWER_STYLES[0]
  return (
    <button
      type="button"
      className={`answer-tile answer-tile--${style.colour}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
    >
      <span className={`answer-shape answer-shape--${style.shape}`} aria-hidden="true" />
      <span className="answer-tile__label">{label}</span>
    </button>
  )
}
