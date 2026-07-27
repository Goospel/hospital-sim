"use client";

import { simDept } from "@/sim/dept";
import { priorityOf, type Pawn, type Priority, type PriorityKind } from "@/sim/pawn";
import {
  busyDoctorIds, doctorActivityMark, fatigueTone, FATIGUE_COLOR, nextPriority, noRestSpotIdle,
  PRIORITY_LABEL, saturationText,
} from "./simHud";
import { FATIGUE_MAX } from "@/game/doctor";

/**
 * 인사 패널 — **플레이어가 시뮬에 개입하는 유일한 손잡이**가 여기 있다.
 *
 * 건설은 판을 바꾸고 채용은 사람을 늘리지만, 둘 다 *이미 있는 사람이 무엇을 할지*는 못 정한다.
 * 이 패널의 세 칸(진료·응급·휴식)이 그 자리다 — 그리고 그중 실제로 게임을 바꾸는 것은 **0(금지)**
 * 이다: 응급을 끈 순환기 의사가 있는 병원은 순환기가 *없는* 병원과 같은 판정을 받는다.
 *
 * 같은 줄에 **사람의 상태**를 함께 놓는 것이 이 화면의 나머지 절반이다. 피로 막대·포화 카운트·
 * 사직 예고가 손잡이 옆에 서 있어야 "무엇을 껐더니 누가 덜 갈리는가"가 한 화면에서 읽힌다.
 * 특히 **사직 카운트다운**: 코어는 주말에 한 번 통지하는데 임계가 며칠뿐이라 그때 처음 알면
 * 대응할 시간이 없다 — 이 줄이 코어 튜닝 없이 그 창을 넓힌다(표시로 밸런스를 완화한다).
 *
 * 계산은 하지 않는다: 값은 `priorityOf`, 순환은 `nextPriority`, 판정은 simHud 술어가 준다.
 * 여기서 다시 세면 시뮬이 보는 의사와 화면이 보는 의사가 갈린다.
 */
export default function PriorityPanel({
  pawns,
  resigningIds,
  onSetPriority,
  onClose,
}: {
  pawns: Pawn[];
  /** 이번 주말에 떠나는 의사들 — 판정은 코어(week.resigningSimDoctors)가 했고 여기선 읽기만 한다. */
  resigningIds: ReadonlySet<string>;
  onSetPriority: (doctorId: string, kind: PriorityKind, value: Priority) => void;
  onClose: () => void;
}) {
  const doctors = pawns.filter((p) => p.kind === "DOCTOR");
  const busy = busyDoctorIds(pawns);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="인사 — 우선순위"
      /* 세로 가운데는 아이의 `my-auto`로 잡는다(T-088) — HirePanel·결산 오버레이와 같은 구조다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-md flex-col gap-3 border border-frame bg-desk-2 px-5 py-5">
        <h2 className="text-sm font-semibold text-on-desk">인사 — 우선순위</h2>

        {/* 해석 카피 없이 규칙만 — "응급을 끄면 안 됩니다" 같은 말을 쓰지 않는다. 무슨 일이
            일어나는지만 적고 판단은 플레이어가 한다(§show don't tell). */}
        {/* ⚠️ **보간값 바로 뒤에 조사를 붙이지 않는다.** 한국어 조사는 앞 글자의 받침에 따라
            갈리는데(은/는·이/가·로/으로) 라벨은 상수 표에서 오므로 그 표를 고치는 순간 문장이
            어긋난다 — 실측으로 두 번 밟았다("금지은", 이어서 "「금지」으로"). 조사는 항상
            **고정 단어**(여기서는 "칸") 뒤에 오게 쓴다. */}
        <p className="text-xs leading-relaxed text-on-desk-muted">
          칸을 누르면 {PRIORITY_LABEL[2]} → {PRIORITY_LABEL[3]} → {PRIORITY_LABEL[1]} → {PRIORITY_LABEL[0]} 순으로
          바뀝니다. 「{PRIORITY_LABEL[0]}」 칸으로 내린 일은 아예 하지 않습니다 — 응급을 끈 과는 그 과가 없는 것과 같습니다.
        </p>

        {doctors.length === 0 ? (
          <p className="border-y border-frame py-6 text-center text-sm text-on-desk-muted">
            아직 의사가 없습니다. 먼저 채용하세요.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-frame border-y border-frame">
            {doctors.map((p) => {
              const mark = doctorActivityMark(p);
              const saturation = saturationText(p);
              const leaving = resigningIds.has(p.id);
              const idle = noRestSpotIdle(p, busy);
              const fatigue = p.fatigue ?? 0;
              return (
                <li key={p.id} className="flex flex-col gap-2 py-3">
                  {/* ① 누구인가 — 과와 사번. 사번을 쓰는 건 같은 과 의사가 둘일 때 줄이 구별되어야
                      우선순위를 누가 받았는지 알 수 있기 때문이다(사람에게 이름을 주지는 않는다 —
                      캐릭터 디자인 §익명). */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm text-on-desk">{p.dept ? simDept(p.dept).label : "과 없음"}</span>
                    <span className="font-mono text-[10px] tabular-nums text-on-desk-muted">{p.id}</span>
                    {mark && (
                      <span className="ml-auto font-mono text-[11px] text-on-desk-muted" title={mark.label}>
                        {mark.glyph} {mark.label}
                      </span>
                    )}
                  </div>

                  {/* ② 지금 이 사람의 상태 — 피로 막대(TileMap 아바타와 **같은 톤 함수**)와 배지들.
                      색이 아니라 길이·글자가 판정을 진다(색 단독 신호 금지 — 관통 규칙). */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className="h-[3px] w-24 overflow-hidden"
                      style={{ backgroundColor: "rgba(216,207,175,0.18)" }}
                      aria-hidden
                    >
                      <span
                        className="block h-full"
                        style={{
                          width: `${Math.max(0, Math.min(1, fatigue / FATIGUE_MAX)) * 100}%`,
                          backgroundColor: FATIGUE_COLOR[fatigueTone(fatigue)],
                        }}
                      />
                    </span>
                    <span className="font-mono text-[10px] tabular-nums text-on-desk-muted">피로 {Math.round(fatigue)}</span>
                    {saturation && (
                      <span className="border border-alarm/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-alarm">
                        {saturation}
                      </span>
                    )}
                    {/* 사직 예고 — 주말 결산의 통지와 **같은 명단**을 읽는다(단일 출처). 주중에
                        미리 보이는 것이 이 배지의 존재 이유다. */}
                    {leaving && (
                      <span className="border border-alarm bg-alarm/10 px-1.5 py-0.5 text-[10px] text-alarm">
                        이번 주말 떠남
                      </span>
                    )}
                    {/* 태업 힌트 — 쉬라고 매겼는데 쉴 자리가 없어 아무것도 못 하는 상태.
                        규칙대로의 결과지만 화면에 흔적이 없어 "의사가 고장 났다"로 보인다. */}
                    {idle && (
                      <span className="border border-frame px-1.5 py-0.5 text-[10px] text-on-desk-muted">
                        쉴 자리 없음
                      </span>
                    )}
                  </div>

                  {/* ③ 세 칸 — 진료·응급·휴식. 값은 코어(priorityOf)가, 다음 값은 nextPriority가
                      정한다. 순환이 0~3만 만들므로 setDoctorPriority의 범위 throw는 **도달 불가**다
                      (그래서 여기에 방어 코드가 없다 — 근거는 simHud.nextPriority 주석·테스트). */}
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["exam", "진료"],
                        ["emergency", "응급"],
                        ["rest", "휴식"],
                      ] as [PriorityKind, string][]
                    ).map(([kind, label]) => {
                      const value = priorityOf(p, kind);
                      const banned = value === 0;
                      return (
                        <button
                          key={kind}
                          type="button"
                          title={`${label} — ${PRIORITY_LABEL[value]} (누르면 ${PRIORITY_LABEL[nextPriority(value)]})`}
                          onClick={() => onSetPriority(p.id, kind, nextPriority(value))}
                          className={`flex flex-col items-center gap-0.5 border px-2 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted ${
                            banned
                              ? "border-alarm text-alarm"
                              : "border-frame text-on-desk hover:border-on-desk-muted"
                          }`}
                        >
                          <span className="text-[10px] text-on-desk-muted">{label}</span>
                          {/* 금지는 취소선까지 — 색만으로 지지 않게(흑백으로 찍어도 읽힌다). */}
                          <span className={`text-xs ${banned ? "line-through" : ""}`}>{PRIORITY_LABEL[value]}</span>
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-1 rounded-xs border border-frame bg-desk py-2.5 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
