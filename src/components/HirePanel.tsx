"use client";

import type { Candidate } from "@/sim/candidate";
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from "@/sim/dept";
import { nurseCount, type Pawn } from "@/sim/pawn";
import { TRAITS } from "@/sim/traits";
import { NURSE_WEEKLY_COST_MANWON } from "@/sim/week";
import { LANDING } from "./landingPalette";
import { DoctorSprite } from "./PixelSprite";
import { doctorCountByDept, formatManwon, startingRosterMet, STARTING_ROSTER_MIN } from "./simHud";

/**
 * 채용 패널 — 이 게임에서 플레이어가 내리는 **첫 결정**이 여기서 일어난다(개원 시 의사 0명).
 *
 * 화면의 요지는 "누구를 뽑을까"가 아니라 **뽑는 순간 주급이 확정된다**는 것이다. 그래서 각 과에
 * 주급을 나란히 놓고, 아래에 지금 병원이 매주 무는 고정비 합계를 둔다 — 필수과를 채울수록
 * 그 숫자가 커지는 걸 채용 화면에서 이미 보게 하는 게 이 슬라이스의 논지다.
 *
 * 계산은 하지 않는다: 인원은 폰에서(doctorCountByDept), 주급은 카탈로그에서(simDept), 후보는
 * candidate.remainingCandidates에서 그대로 읽는다. 여기서 다시 세면 결산·코어와 조용히 갈린다.
 *
 * ⚠️ **채용 일시금은 없다**(hireDoctor — 금고 무변). 이 패널이 금고를 보여주되 "잔액 부족"
 * 같은 판정을 하지 않는 이유다: 채용의 대가는 지금이 아니라 주말에 온다.
 *
 * 대신 **돈으로 못 사는 제약**이 여기 하나 더 있다: 전국에 남은 그 과 사람. 예전엔 그걸 「전국
 * 잔여 N명」이라는 **카운트**로 보여줬는데, 지금은 **남은 사람 명단**을 그대로 편다 — 카드 한
 * 장이 한 사람(이름·특성 둘·사연 한 줄·얼굴)이고, 뽑히면 그 카드가 사라진다. 숫자가 8에서 7로
 * 주는 것과 얼굴 하나가 화면에서 없어지는 것은 같은 사실이지만 **읽히는 무게가 다르다**:
 * 사직자는 그 명단으로 **돌아오지 않는다**(week.startNextWeek). 목록이 비면 그 과는 한 판 내내 끝이다.
 *
 * ⚠️ 카드의 얼굴은 `cand.name`을 변주 키로 그린다 — 맵의 폰도 같은 키를 쓰므로(TileMap) 카드에서
 * 본 사람과 부지에 선 사람이 **같은 얼굴**이다. 채용 시점에야 정해지는 `p.id`를 쓰면 카드가 그
 * 값을 미리 알 수 없어 두 화면이 갈린다.
 *
 * ⚠️ 카드는 「채용」 버튼을 **비활성으로 잠그지 않는다**(잠글 대상인 빈 슬롯 자체가 화면에 없다).
 * 그래도 코어의 거부 경로(NO_POOL·SLOT_TAKEN 토스트)는 그대로 남는다 — 이중 벨트다: 화면이 낡은
 * 스냅샷으로 이미 뽑힌 사람을 다시 열어 줘도 세계는 안 바뀌고, 그 사실이 토스트로 말해진다
 * (조용히 먹히는 버튼이 최악이다).
 */
export default function HirePanel({
  pawns,
  candidates,
  treasuryManwon,
  starting = false,
  onHire,
  onHireNurse,
  onClose,
}: {
  pawns: Pawn[];
  /** 과별 **남은 후보 명단** — 세계가 들고 있는 값의 순수 파생을 그대로 읽는다(화면이 세지 않는다). */
  candidates: Record<SimDeptKey, Candidate[]>;
  treasuryManwon: number;
  /** **개원 전 스타팅 로스터 모드**(사용자 지시 2026-07-29) — 같은 패널을 게이트로 쓴다.
   *  새 화면을 만들지 않은 이유: 이 패널은 이미 "플레이어의 첫 결정"으로 설계돼 있다(머리말).
   *  과별 주급이 나란히 서고 아래에 주 고정비 합계가 붙어, **필수과를 채울수록 그 숫자가
   *  커지는 것**을 뽑기 전에 보게 한다 — 스타팅 로스터가 딜레마여야 하는 이유가 이미 여기 있다.
   *  화면이 둘이면 그 대조를 두 번 그려야 하고, 그중 하나는 반드시 낡는다. */
  starting?: boolean;
  /** 후보 지목 채용 — **(과, 슬롯)이 사람의 좌표다**(candidate.candidateOf). 과만 넘기면
   *  코어가 남은 슬롯 중 하나를 고르게 되어 "카드에서 고른 그 사람"이라는 약속이 깨진다. */
  onHire: (dept: SimDeptKey, slot: number) => void;
  /** 간호사 채용 — **과 인자가 없다**(간호사는 과가 아니다). 실패 사유도 없다: 전국 풀이
   *  걸리지 않으므로 코어가 세계를 그냥 돌려준다(pawn.hireNurse). */
  onHireNurse: () => void;
  /** 닫기 — 스타팅 모드에서는 **최소 인원을 채워야** 열린다(부모가 판정한다). */
  onClose: () => void;
}) {
  const counts = doctorCountByDept(pawns);
  const nurses = nurseCount(pawns);
  // 간호사 주급도 합계에 든다 — 이 줄이 "지금 병원이 매주 무는 돈"이라, 빼면 화면이 말하는
  // 액수와 주간 결산에서 빠지는 액수가 갈린다(결산은 nursing 블록으로 함께 청구한다 · week.ts).
  const weeklyTotal =
    HIRABLE_DEPTS.reduce((sum, k) => sum + counts[k] * simDept(k).weeklyCostManwon, 0)
    + nurses * NURSE_WEEKLY_COST_MANWON;
  const hired = HIRABLE_DEPTS.reduce((n, k) => n + counts[k], 0);
  const met = startingRosterMet(pawns);
  const title = starting ? "개원 준비 — 전국 인력 시장" : "채용 — 전국 인력 시장";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      /* 세로 가운데는 아이의 `my-auto`로 잡는다(T-088) — 스크롤 컨테이너에서 items-center는
         내용이 뷰포트보다 길어지면 아이의 위쪽을 스크롤로 닿을 수 없는 곳으로 밀어낸다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-4xl flex-col gap-3 border border-frame bg-desk-2 px-5 py-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-on-desk">{title}</h2>
          <span className="font-mono text-xs tabular-nums text-on-desk-muted">
            금고 {formatManwon(treasuryManwon)}
          </span>
        </div>

        {/* 스타팅 모드의 첫 문장 — **왜 강제인지**를 먼저 말한다. 이유 없이 막힌 화면은
            튜토리얼이 아니라 장애물이다. 아래 진행 표시는 "몇 명 남았나"를 숫자로 준다. */}
        {starting && (
          <p className="text-xs text-on-desk">
            의사가 없으면 환자는 접수처에서 전부 돌아갑니다. 진료할 사람을 최소{" "}
            <span className="font-mono tabular-nums">{STARTING_ROSTER_MIN}</span>명 뽑고 시작합니다.
          </p>
        )}

        {/* 해석 카피 없이 사실만 — "필수과는 적자입니다" 같은 문장을 쓰지 않는다. 주급이
            과마다 나란히 서 있으면 대조는 플레이어가 읽는다. */}
        <p className="text-xs text-on-desk-muted">
          채용에 일시금은 없습니다. 비용은 매주 결산에서 주급으로 청구됩니다.
        </p>
        <p className="text-xs text-on-desk-muted">
          전국에 남은 사람이 이 화면의 전부입니다. 떠난 사람은 돌아오지 않습니다.
        </p>

        <div className="grid grid-cols-2 items-start gap-3 sm:grid-cols-4">
          {HIRABLE_DEPTS.map((key) => {
            const spec = simDept(key);
            const rest = candidates[key];
            return (
              <section key={key} className="flex flex-col gap-2 border border-frame bg-desk px-2.5 py-2.5">
                <header>
                  <h3 className="text-sm text-on-desk">{spec.label}</h3>
                  <p className="font-mono text-xs tabular-nums text-on-desk-muted">
                    주급 {formatManwon(spec.weeklyCostManwon)} · 현재 {counts[key]}명 · 잔여 {rest.length}명
                  </p>
                </header>

                {rest.map((cand) => (
                  <article key={cand.slot} className="flex flex-col gap-1.5 border border-frame bg-desk-2 px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      {/* 얼굴 — 변주 키가 이름인 것이 계약이다(머리말). 맵의 폰과 같은 값을 넣어야
                          카드에서 고른 사람이 부지에도 그대로 선다. */}
                      <span className="h-10 w-10 shrink-0">
                        <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.name} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-on-desk">{cand.name}</p>
                        <p className="truncate text-[11px] text-on-desk-muted">
                          {TRAITS[cand.traits[0]].label} · {TRAITS[cand.traits[1]].label}
                        </p>
                      </div>
                    </div>
                    {/* 사연 한 줄 — 첫 특성의 story를 **그대로** 쓴다. 이름·과를 끼워 넣지 않는
                        것이 traits.ts의 계약이다(보간값 뒤 조사 분기 · T-094). */}
                    <p className="text-[11px] text-on-desk-muted">{TRAITS[cand.traits[0]].story}</p>
                    <button
                      type="button"
                      onClick={() => onHire(cand.dept, cand.slot)}
                      className="border border-frame px-3 py-1 text-xs text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
                    >
                      채용
                    </button>
                  </article>
                ))}

                {rest.length === 0 && (
                  <p className="border border-dashed border-frame px-2.5 py-3 text-[11px] text-alarm">
                    전국에 남은 {spec.label} 의사가 없습니다.
                  </p>
                )}
                {/* 바닥이 보이기 시작하는 지점 — 카드가 두 장 이하로 줄면 그 사실을 말한다.
                    잔여 숫자는 위에 이미 있지만, 목록 끝에서 읽는 이 한 줄이 "다음 판에 또 뽑으면
                    되지"라는 오해를 끊는다. */}
                {rest.length > 0 && rest.length <= 2 && (
                  <p className="text-center text-[11px] text-on-desk-muted">이게 전부입니다</p>
                )}
              </section>
            );
          })}
        </div>

        {/* 간호사 — 과 카드와 달리 **한 줄**이다: 간호사는 카탈로그 밖이라 전국 풀이 없고
            (pawn.hireNurse), 없는 제약을 후보 카드로 흉내 내면 화면이 시뮬에 없는 규칙을
            주장한다. 스타팅 게이트도 이 줄을 세지 않는다 — 개원 강제는 **의사만**이다
            (simHud.startingRosterMet 불변). 체크리스트가 대신 안내한다. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-frame py-2.5">
          <span className="min-w-24 text-sm text-on-desk">간호사 · 수납 담당</span>
          <span className="font-mono text-xs tabular-nums text-on-desk-muted">현재 {nurses}명</span>
          <span className="ml-auto font-mono text-xs tabular-nums text-on-desk-muted">
            주급 {formatManwon(NURSE_WEEKLY_COST_MANWON)}
          </span>
          <button
            type="button"
            onClick={onHireNurse}
            className="border border-frame px-3 py-1 text-xs text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
          >
            채용
          </button>
          {/* 해석 카피 없이 사실만 — 접수처 카운터에 간호사가 있어야 진료비가 걷힌다는 규칙 그대로. */}
          <p className="w-full text-[11px] text-on-desk-muted">
            접수처 카운터에 간호사가 있어야 진료비를 받습니다.
          </p>
        </div>

        <div className="flex items-baseline justify-between font-mono text-xs tabular-nums">
          <span className="font-sans text-on-desk-muted">주 고정비 합계</span>
          <span className="text-on-desk">{formatManwon(weeklyTotal)}</span>
        </div>

        {/* 스타팅 모드의 진행 — **버튼이 왜 잠겼는지**가 버튼 바로 위에 있어야 한다.
            잠긴 버튼만 있고 이유가 멀면 그건 고장으로 읽힌다. */}
        {starting && !met && (
          <p className="font-mono text-xs tabular-nums text-on-desk-muted">
            {hired} / {STARTING_ROSTER_MIN}명 — {STARTING_ROSTER_MIN - hired}명 더 뽑으면 시작합니다
          </p>
        )}

        <button
          type="button"
          disabled={starting && !met}
          onClick={onClose}
          /* 「개원 준비 시작」만 확정 버튼(청록) — 「닫기」는 판을 진행시키지 않으므로 중립 그대로다.
             hover는 어둡게만 한다(밝히면 흰 글자 4.5:1이 런타임에 깨진다 · T-142). */
          className={
            starting
              ? "mt-1 rounded-xs py-2.5 text-sm font-medium transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:brightness-100"
              : "mt-1 rounded-xs border border-frame bg-desk py-2.5 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted disabled:cursor-not-allowed disabled:text-on-desk-muted/40 disabled:hover:bg-desk"
          }
          style={starting ? { background: LANDING.accent, color: LANDING.onAccent } : undefined}
        >
          {starting ? "개원 준비 시작" : "닫기"}
        </button>
      </div>
    </div>
  );
}
