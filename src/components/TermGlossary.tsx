"use client";

import { useId, useState } from "react";
import { termsInText } from "@/game/glossary";

/**
 * 세계 이벤트 헤드라인의 전문용어 opt-in 풀이 — 기본 접힘, 원하는 사람만 펼친다.
 * 아는 용어가 없는 헤드라인엔 아무것도 그리지 않는다(토글조차 없음) → 미니멀함·show-don't-tell 유지.
 * 재사용 가능: 헤드라인이든 다른 본문이든 text만 넘기면 그 안의 용어를 감지해 푼다.
 */
export default function TermGlossary({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const entries = termsInText(text);
  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="self-start rounded text-xs text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
      >
        용어 풀이 {open ? "▴" : "▾"}
      </button>

      {open && (
        <dl
          id={panelId}
          className="flex flex-col gap-3 rounded-lg border border-zinc-800 bg-white/[0.02] px-4 py-3"
        >
          {entries.map((e) => (
            <div key={e.term} className="flex flex-col gap-0.5">
              <dt className="text-sm font-semibold text-zinc-200">{e.term}</dt>
              <dd className="text-xs leading-5 text-zinc-400">{e.def}</dd>
              <dd className="text-xs leading-5 text-zinc-500">{e.context}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
