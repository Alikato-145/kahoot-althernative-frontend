import { NextResponse } from 'next/server'
import { z } from 'zod'
import { MAX_MEDIA_BYTES, isSupportedImageType, writeQuizMedia } from '@/server/media'

const quizIdSchema = z.string().uuid()

export async function POST(request: Request): Promise<NextResponse> {
  const form = await request.formData()
  const quizId = quizIdSchema.safeParse(form.get('quizId'))
  const file = form.get('file')
  if (!quizId.success || !(file instanceof File)) return NextResponse.json({ error: 'quizId and image file are required' }, { status: 422 })
  if (!isSupportedImageType(file.type)) return NextResponse.json({ error: 'Unsupported image type' }, { status: 422 })
  if (file.size > MAX_MEDIA_BYTES) return NextResponse.json({ error: 'Image must not exceed 8 MB' }, { status: 422 })
  return NextResponse.json({ url: await writeQuizMedia(quizId.data, file) }, { status: 201 })
}
