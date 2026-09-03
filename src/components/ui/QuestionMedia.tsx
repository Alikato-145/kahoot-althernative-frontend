import type { ImgHTMLAttributes } from 'react'
import React from 'react'

export interface QuestionMediaProps extends Pick<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  className?: string
}

/** Responsive question artwork shared by host and player screens. */
export function QuestionMedia({ src, alt, className = '' }: QuestionMediaProps) {
  if (!src) return null

  return (
    <img
      className={`question-media ${className}`.trim()}
      src={src}
      alt={alt ?? ''}
      role="img"
      loading="lazy"
      decoding="async"
    />
  )
}
