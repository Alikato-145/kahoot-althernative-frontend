import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { loadConfig } from '@/server/config'
import { resolvePublicMediaPath } from '@/server/media'

const contentTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }

export async function GET(_: Request, { params }: { params: { path: string[] } }): Promise<Response> {
  const filePath = resolvePublicMediaPath(loadConfig().mediaRoot, params.path)
  if (!filePath) return new Response('Not found', { status: 404 })
  try {
    if (!(await stat(filePath)).isFile()) return new Response('Not found', { status: 404 })
    const type = contentTypes[path.extname(filePath).toLowerCase()]
    if (!type) return new Response('Not found', { status: 404 })
    return new Response(await readFile(filePath), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
