import Link from 'next/link'

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-700 via-purple-700 to-fuchsia-600 p-6 text-white">
      <section className="w-full max-w-2xl space-y-8 rounded-3xl bg-white/10 p-8 text-center shadow-2xl backdrop-blur sm:p-12">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-white/70">Camp Quiz</p>
        <h1 className="text-5xl font-black sm:text-7xl">พร้อมเล่นหรือยัง?</h1>
        <p className="mx-auto max-w-lg text-lg text-white/85">เกมตอบคำถามแบบสดสำหรับทุกคนในค่าย เข้าร่วมด้วยโทรศัพท์ หรือเปิดโหมด Host บนจอโปรเจกเตอร์</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/join" className="rounded-2xl bg-white px-6 py-4 text-xl font-black text-purple-800 shadow-lg transition hover:-translate-y-1">เข้าร่วมเกม</Link>
          <Link href="/host" className="rounded-2xl border-2 border-white/70 px-6 py-4 text-xl font-black transition hover:-translate-y-1 hover:bg-white/10">สำหรับ Host</Link>
        </div>
      </section>
    </main>
  )
}
