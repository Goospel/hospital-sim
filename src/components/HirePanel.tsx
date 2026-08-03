"use client";

import type { Candidate } from "@/sim/candidate";
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from "@/sim/dept";
import type { NurseGrade } from "@/sim/nurse";
import type { Pawn } from "@/sim/pawn";
import { TRAITS } from "@/sim/traits";
import { NURSE_WEEKLY_COST_MANWON } from "@/sim/week";
import { LANDING } from "./landingPalette";
import { DEPT_COLOR, DoctorSprite } from "./PixelSprite";
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
 * ⚠️ 카드는 「채용」 버튼을 **비활성으로 잠그지 않는다**. 잠글 대상인 빈 슬롯은 화면에 있지만
 * (아래 잔상 프레임) 그건 **버튼이 아예 없는 자리**다 — 잠긴 버튼은 "지금은 안 되지만 언젠가"를
 * 뜻하는데 소비된 슬롯은 영영 안 열린다. 코어의 거부 경로(NO_POOL·SLOT_TAKEN 토스트)는 그대로
 * 남는다 — 이중 벨트다: 화면이 낡은 스냅샷으로 이미 뽑힌 사람을 다시 열어 줘도 세계는 안 바뀌고,
 * 그 사실이 토스트로 말해진다(조용히 먹히는 버튼이 최악이다).
 *
 * ⚠️ **후보 카드만 종이다**(2026-08-03 · 그래픽 재설계 스펙 §1). 패널 바탕은 desk 그대로이고
 * 카드 한 장 한 장이 `.paper-card`(globals.css 단일 출처) — 책상 위에 인사 서류가 놓인 그림이다.
 * 종이 위 글자는 **전부 ink 계열**이다: on-desk 계열은 어두운 지면 전용이라 종이 위에 얹으면
 * 대비가 뒤집힌다. 간호사 줄·주 고정비·개원 버튼은 카드가 아니므로 desk 톤 그대로 둔다.
 */
export default function HirePanel({
  pawns,
  candidates,
  consumed,
  nursing,
  treasuryManwon,
  starting = false,
  onHire,
  onHireNurse,
  onClose,
}: {
  pawns: Pawn[];
  /** 과별 **남은 후보 명단** — 세계가 들고 있는 값의 순수 파생을 그대로 읽는다(화면이 세지 않는다). */
  candidates: Record<SimDeptKey, Candidate[]>;
  /** 과별 **소비된 슬롯의 사람** — 부모가 `hiredSlots`를 `candidateOf`로 매핑해 내린다.
   *  화면이 "누가 빠졌나"를 세지 않는 이유는 `candidates`와 같다(위 주석). 이 목록이
   *  잔상 프레임이 되어 **열의 길이를 지역 풀 총량으로 고정한다** — 뽑을수록 카드가 빈 자리로
   *  바뀌되 열은 짧아지지 않는다. 열이 짧아지면 인력이 줄었다는 사실이 화면에서 사라진다. */
  consumed: Record<SimDeptKey, Candidate[]>;
  /** 간호 판정 — **결과째 받는다**(화면이 세지도 기준을 다시 적지도 않는다). 인원은 폰에서 셀 수
   *  있지만 **기준 산식(⌈의사÷2⌉)의 단일 출처는 `sim/nurse.nurseGradeOf`**라, 그 한 줄을 여기
   *  복제하면 튜닝하는 날 채용 화면만 옛 기준을 말한다 — 그리고 그 어긋남은 결산의 감산이
   *  붙고 나서야 보인다(이 prop이 생긴 이유가 정확히 그 사후 발견이다). */
  nursing: { count: number; required: number; grade: NurseGrade };
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
  // 간호사 주급도 합계에 든다 — 이 줄이 "지금 병원이 매주 무는 돈"이라, 빼면 화면이 말하는
  // 액수와 주간 결산에서 빠지는 액수가 갈린다(결산은 nursing 블록으로 함께 청구한다 · week.ts).
  // 인원은 **판정과 같은 수**를 쓴다(nursing.count) — 여기서 따로 세면 같은 화면의 「현재 N명」과
  // 이 합계가 다른 숫자를 근거로 설 수 있다.
  const weeklyTotal =
    HIRABLE_DEPTS.reduce((sum, k) => sum + counts[k] * simDept(k).weeklyCostManwon, 0)
    + nursing.count * NURSE_WEEKLY_COST_MANWON;
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
            /* 열의 자리 = 남은 후보 + 소비된 슬롯을 **슬롯 번호 순**으로. 한 슬롯은 둘 중 한쪽에만
               있다(remainingCandidates가 소비분을 뺀 나머지라) — 합쳐 정렬하면 그 지역 풀이
               슬롯 순서대로 정확히 한 번씩 선다. 뽑힌 사람은 자리를 비우는 게 아니라 **자리에
               남은 자국**이 된다. */
            const seats = [
              ...rest.map((cand) => ({ cand, taken: false })),
              ...consumed[key].map((cand) => ({ cand, taken: true })),
            ].sort((a, b) => a.cand.slot - b.cand.slot);
            return (
              <section key={key} className="flex flex-col gap-2">
                {/* 열은 desk 위 투명 배경이다 — 상자를 하나 더 두면 그 안의 종이가 "액자 속 종이"가
                    된다. 과를 나르는 것은 헤더 밑의 색 언더라인 하나뿐이다(과 색 단일 출처). */}
                <header className="border-b-2 pb-1" style={{ borderColor: DEPT_COLOR[key] }}>
                  <h3 className="text-sm text-on-desk">{spec.label}</h3>
                  <p className="font-mono text-xs tabular-nums text-on-desk-muted">
                    주급 {formatManwon(spec.weeklyCostManwon)} · 현재 {counts[key]}명 · 잔여 {rest.length}명
                  </p>
                </header>

                {seats.map(({ cand, taken }) =>
                  taken ? (
                    /* 잔상 프레임 — **라벨도 사유도 없다.** "채용됨/떠남"을 화면이 새로 판정하지
                       않고, 그 사람이 그 자리였고 지금 명단에 없다는 사실만 그린다. 점선 테두리와
                       탁한 종이 바탕이 "여기 종이가 있었다"를 말한다.
                       ⚠️ **배경에 알파를 주지 않는다**(옛 `bg-paper-edge/45`) — 뒤가 어두운 모달
                       (desk-2)이라 합성 결과가 종이도 desk도 아닌 중간색(#655e50)이 되고, 그 위
                       흐린 잉크가 1.19:1까지 내려갔다(리뷰 2026-08-03 실측). 불투명 paper-edge는
                       paper보다 탁해 "빈 자리" 톤 차이를 알파 없이도 낸다. */
                    <article
                      key={cand.slot}
                      className="flex flex-col items-center gap-1 border border-dashed border-border-paper bg-paper-edge px-2 py-2"
                    >
                      {/* 잉크 단색 실루엣 — CSS 필터로 채도를 죽이고 어둡게 눌러 옅게 얹는다
                          (SVG 그라디언트·id는 계약상 금지 · PixelSprite 머리말). */}
                      <span className="h-14 w-14 opacity-25 grayscale brightness-[0.15]">
                        <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.name} />
                      </span>
                      <p className="w-full truncate text-center text-[11px] text-ink">{cand.name}</p>
                    </article>
                  ) : (
                    <article key={cand.slot} className="paper-card flex flex-col gap-1.5 overflow-hidden pb-2">
                      {/* 초상 스테이지 — 카드 폭 전체. 배경은 과 색을 종이 위에 15%로 얹은 워시라
                          (`26` = 0x26/255) 과가 색으로 먼저 읽히고, 얼굴은 그 위에 크게 선다.
                          얼굴 변주 키가 이름인 것이 계약이다(머리말) — 맵의 폰과 같은 값을 넣어야
                          카드에서 고른 사람이 부지에도 그대로 선다. */}
                      <div
                        className="flex h-[72px] items-center justify-center"
                        style={{ background: `${DEPT_COLOR[cand.dept]}26` }}
                      >
                        <span className="h-16 w-16">
                          <DoctorSprite dept={cand.dept} busy={false} variantKey={cand.name} />
                        </span>
                      </div>
                      <div className="flex flex-col gap-1.5 px-2.5">
                        <p className="truncate text-base text-ink">{cand.name}</p>
                        {/* 특성 칩 — 가운뎃점으로 잇던 한 줄을 칩 둘로 나눈다. 서류의 도장난처럼
                            읽히라고 테두리를 두르되 색은 rule/ink-2까지다(종이 위 톤). */}
                        <div className="flex flex-wrap gap-1">
                          {cand.traits.map((t) => (
                            <span key={t} className="border border-rule px-1.5 py-px text-[10px] text-ink-2">
                              {TRAITS[t].label}
                            </span>
                          ))}
                        </div>
                        {/* 사연 한 줄 — 첫 특성의 story를 **그대로** 쓴다. 이름·과를 끼워 넣지 않는
                            것이 traits.ts의 계약이다(보간값 뒤 조사 분기 · T-094). */}
                        <p className="text-[11px] leading-relaxed text-ink-2">{TRAITS[cand.traits[0]].story}</p>
                        {/* 보이는 라벨은 「채용」 하나로 족하다(카드 안에 이미 사람이 있다) — 그러나
                            접근성 이름엔 사람이 실려야 한다: 스크린리더의 버튼 목록에서는 카드 맥락이
                            사라져 「채용」 여덟 개만 남는다.
                            hover는 **어둡게만** 한다 — 종이 위에서 밝히면 ink 글자의 4.5:1이
                            런타임에 깨진다(T-142). */}
                        <button
                          type="button"
                          aria-label={`${cand.name} 채용`}
                          onClick={() => onHire(cand.dept, cand.slot)}
                          className="border border-border-paper px-3 py-1 text-xs text-ink transition-colors hover:bg-ink/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-paper"
                        >
                          채용
                        </button>
                      </div>
                    </article>
                  ),
                )}

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
          {/* 기준을 인원 **바로 옆**에 놓는 것이 이 줄의 전부다 — 결산 화면이 이미 같은 형태로
              말하고 있는데(WeekEndOverlay 「간호 인력 (N명 · 기준 M명)」), 뽑는 자리에는 없어서
              미달이 **주말의 감산으로 처음** 인지됐다(12주 실플레이 관측). 규칙 신설이 아니라
              이미 있는 규칙을 결정 시점으로 당기는 표시다.
              해석 카피 없이 사실만(§톤): 툴팁도 "무엇이 일어나는가"까지고 "뽑으세요"는 없다. */}
          <span
            className={`font-mono text-xs tabular-nums ${
              nursing.grade === "SHORT" ? "text-alarm" : "text-on-desk-muted"
            }`}
            title={
              nursing.grade === "SHORT"
                ? "기준에 못 미치면 주간 진료 수익이 감산됩니다(간호등급)."
                : undefined
            }
          >
            현재 {nursing.count}명 · 기준 {nursing.required}명
          </span>
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
