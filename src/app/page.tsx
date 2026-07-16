export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-zinc-950 px-6 text-center text-zinc-100">
      <p className="mb-6 text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
        실시간 전원 협상 시뮬레이션
      </p>

      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        수화기 너머의 벽
      </h1>

      <p className="mt-6 max-w-md text-base leading-7 text-zinc-400 sm:text-lg">
        골든타임이 끝나기 전에, 이 환자를 받아줄 병원을 찾아라.
        <br />
        전화기 너머의 거절이 쌓일수록 드러나는 건,
        <br className="sm:hidden" /> 당신의 실력이 아니라{" "}
        <span className="text-zinc-200">구조</span>다.
      </p>

      <p className="mt-16 text-xs tracking-wide text-zinc-600">
        NAN 2026 · 프로토타입 — 곧 플레이 가능
      </p>
    </main>
  );
}
