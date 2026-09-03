'use client'

import type { EditorQuestion, PendingImage } from './QuizEditor'
import { ImageUpload } from './ImageUpload'

type Props = { question: EditorQuestion; index: number; quizId?: string; onPendingImage: (field: PendingImage['field'], file: File | null) => void; onChange: (question: EditorQuestion) => void; onRemove: () => void }

export function QuestionEditor({ question, index, quizId, onPendingImage, onChange, onRemove }: Props) {
  const setChoice = (choiceIndex: number, body: string) => onChange({ ...question, choices: question.choices.map((choice, current) => current === choiceIndex ? { ...choice, body } : choice) })
  const setCorrect = (choiceIndex: number) => onChange({ ...question, choices: question.choices.map((choice, current) => ({ ...choice, isCorrect: current === choiceIndex })) })
  return <fieldset className="rounded border border-slate-300 p-5 space-y-4">
    <legend className="px-2 font-bold">คำถามที่ {index + 1}</legend>
    <label className="block font-medium">คำถาม<textarea className="mt-1 block w-full rounded border p-2" value={question.body} onChange={(event) => onChange({ ...question, body: event.target.value })} required /></label>
    <ImageUpload quizId={quizId} label="รูปคำถาม" value={question.questionImageUrl ?? null} onPendingFile={(file) => onPendingImage('questionImageUrl', file)} onChange={(questionImageUrl) => onChange({ ...question, questionImageUrl })} />
    <div className="space-y-2"><p className="font-medium">คำตอบ (เลือกคำตอบที่ถูกต้อง 1 ข้อ)</p>{question.choices.map((choice, choiceIndex) => <label key={choiceIndex} className="flex items-center gap-2"><input type="radio" name={`correct-${index}`} checked={choice.isCorrect} onChange={() => setCorrect(choiceIndex)} aria-label={`คำตอบที่ถูกต้อง ${choiceIndex + 1}`} /><span>{choiceIndex + 1}.</span><input className="flex-1 rounded border p-2" value={choice.body} onChange={(event) => setChoice(choiceIndex, event.target.value)} aria-label={`ตัวเลือก ${choiceIndex + 1}`} required /></label>)}</div>
    <ImageUpload quizId={quizId} label="รูปเฉลย" value={question.revealImageUrl ?? null} onPendingFile={(file) => onPendingImage('revealImageUrl', file)} onChange={(revealImageUrl) => onChange({ ...question, revealImageUrl })} />
    <label className="block font-medium">คำอธิบายเฉลย<textarea className="mt-1 block w-full rounded border p-2" value={question.explanation ?? ''} onChange={(event) => onChange({ ...question, explanation: event.target.value })} /></label>
    <button type="button" className="text-sm text-red-700 underline" onClick={onRemove}>ลบคำถาม</button>
  </fieldset>
}
