import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { loadConfig } from './config'

const extensions: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export const MAX_MEDIA_BYTES = 8 * 1024 * 1024

export function resolvePublicMediaPath(mediaRoot: string, segments: string[]): string | null {
  if (segments.length === 0 || segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes(path.sep))) return null
  const root = path.resolve(mediaRoot)
  const target = path.resolve(root, ...segments)
  return target.startsWith(`${root}${path.sep}`) ? target : null
}

export function isSupportedImageType(type: string): type is keyof typeof extensions {
  return type in extensions
}

export async function writeQuizMedia(quizId: string, file: File): Promise<string> {
  if (!isSupportedImageType(file.type)) throw new Error('Only JPEG, PNG, WebP, and GIF images are allowed')
  if (file.size > MAX_MEDIA_BYTES) throw new Error('Image must not exceed 8 MB')
  const filename = `${randomUUID()}${extensions[file.type]}`
  const relativePath = path.join('quizzes', quizId, filename)
  const target = path.resolve(loadConfig().mediaRoot, relativePath)
  const root = path.resolve(loadConfig().mediaRoot)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid quiz media path')
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, Buffer.from(await file.arrayBuffer()), { flag: 'wx' })
  return `/media/quizzes/${encodeURIComponent(quizId)}/${filename}`
}

export async function removeQuizMedia(quizId: string): Promise<void> {
  const root = path.resolve(loadConfig().mediaRoot)
  const target = path.resolve(root, 'quizzes', quizId)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('Invalid quiz media path')
  await rm(target, { recursive: true, force: true })
}
