import { FATIGUE_MAX } from "@/game/doctor";
import { simDept } from "@/sim/dept";
import type { Pawn } from "@/sim/pawn";
import type { NurseGrade } from "@/sim/week";
import { fatigueTone, FATIGUE_COLOR } from "./simHud";

/**
 * 팔레트 하단 **상주 로스터** — 사람의 상태를 인사 패널 밖으로 꺼낸 자리(시안 A · 사용자 확정).
 *
 * 지금까지 피로와 사직 예고는 [사람]→[인사]를 **열어야** 보였다. 그런데 이 게임에서 사람이
 * 갈리는 것은 결산이 아니라 주중 내내 일어나는 일이라, 열어야 보이는 값은 사실상 안 보이는
 * 값이다 — 팔레트가 드릴다운으로 바뀌며 생긴 하단 여백이 그 값의 자리가 된다.
 *
 * **판정은 하나도 새로 만들지 않는다**: 톤은 `fatigueTone`·`FATIGUE_COLOR`(simHud), 간호 등급은
 * 코어가 이미 낸 `nurseGradeOf`의 결과를 받기만 한다. 여기서 다시 세면 같은 병원이 화면마다
 * 다른 색으로 보인다(이 저장소가 여러 번 경고한 이중 기재).
 *
 * ⚠️ **순수 props 컴포넌트**다 — DOM 없이 정적 마크업으로 재기 위함이다(paletteRoster.test.tsx).
 */
export default function PaletteRoster({
  doctors,
  resigningIds,
  nursing,
  onOpen,
}: {
  /** 받은 **순서 그대로** 선다 — 피로순으로 다시 세우면 값이 변할 때마다 줄이 튀어 손이
   *  기억하는 자리가 없어진다(팔레트는 늘 같은 곳에 서 있는 것이 존재 이유다). */
  doctors: Pawn[];
  /** 이번 주말에 떠나는 사람들 — 판정은 코어(week.resigningSimDoctors)가 했고 여기선 읽기만 한다. */
  resigningIds: ReadonlySet<string>;
  /** 간호 판정 — 산식(⌈의사÷2⌉)의 단일 출처는 `sim/nurse.nurseGradeOf`다(HirePanel과 같은 값). */
  nursing: { count: number; required: number; grade: NurseGrade };
  /** 줄을 누르면 인사 패널 — 상태가 가리키는 곳과 손이 갈 곳이 같아야 한 번에 끝난다. */
  onOpen: () => void;
}) {
  // 의사가 없으면 통째로 안 선다 — 「간호 0명 · 기준 0명」과 빈 구분선만 남으면 그건 정보가
  // 아니라 잡음이다(0줄을 안 세우는 이 저장소의 규칙 · simHud.turnAwayBreakdownText).
  if (doctors.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-frame pt-2">
      {doctors.map((p) => {
        const leaving = resigningIds.has(p.id);
        const fatigue = Math.max(0, Math.min(FATIGUE_MAX, p.fatigue ?? 0));
        const name = p.name ?? "이름 미상";
        const dept = p.dept ? simDept(p.dept).label : "과 없음";
        return (
          <button
            key={p.id}
            type="button"
            onClick={onOpen}
            /* 막대는 `aria-hidden`이라 스크린리더에 남는 것은 이 문장뿐이다 — 수치를 여기 싣지
               않으면 피로는 눈으로만 존재하는 값이 된다. */
            aria-label={`${dept} ${name} — 피로 ${Math.round(fatigue)}${leaving ? " · 이번 주말 떠남" : ""}`}
            className="flex flex-col gap-0.5 text-left transition-colors hover:bg-frame/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            <span className="flex items-baseline gap-1">
              <span className="shrink-0 text-[10px] text-on-desk-muted">{dept}</span>
              {/* 사직 예고는 **색과 글자가 같이 진다**(색 단독 신호 금지 — 관통 규칙):
                  흑백으로 찍어도 「떠남」이 읽힌다. 상단 상시 경고와 겹치지만 역할이 다르다 —
                  저쪽은 "몇 명이 떠나는가"(경고), 이 줄은 "누가 떠나는가"(상태)다. */}
              <span className={`truncate text-[11px] ${leaving ? "text-alarm" : "text-on-desk"}`}>{name}</span>
              {leaving && <span className="ml-auto shrink-0 text-[10px] text-alarm">떠남</span>}
            </span>
            {/* 피로 막대 — 인사 패널·아바타와 **같은 톤 함수와 같은 정규화**(3px · 바탕 알파). */}
            <span
              className="block h-[3px] w-full overflow-hidden"
              style={{ backgroundColor: "rgba(216,207,175,0.18)" }}
              aria-hidden
            >
              <span
                className="block h-full"
                style={{
                  width: `${(fatigue / FATIGUE_MAX) * 100}%`,
                  backgroundColor: FATIGUE_COLOR[fatigueTone(fatigue)],
                }}
              />
            </span>
          </button>
        );
      })}

      {/* 간호 — 사람 줄이 아니라 **편성 조건**이라 맨 아래 한 줄로 접는다. 판정(SHORT)은
          채용·결산 화면이 쓰는 그 등급 그대로다: 여기서 기준을 다시 세면 팔레트만 옛 산식을
          말하고, 그 어긋남은 결산의 감산이 붙고 나서야 보인다. */}
      <p
        className={`font-mono text-[10px] tabular-nums ${
          nursing.grade === "SHORT" ? "text-alarm" : "text-on-desk-muted"
        }`}
      >
        간호 {nursing.count}명 · 기준 {nursing.required}명
      </p>
    </div>
  );
}
