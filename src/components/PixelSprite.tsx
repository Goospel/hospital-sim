import type { DeptKey } from "@/game/types";

/**
 * 스프라이트 — inline SVG 벡터. 이미지 파일 0개, 번들 영향 0, 정적 export 안전.
 *
 * ⚠️ **파일 이름이 옛 방식을 가리킨다**(경로를 안 바꿨다 — import 3곳과 문서 표가 이 경로를 든다).
 * 2026-07-30까지는 8×8 픽셀 격자를 `<rect>` 한 칸씩 찍었고, 지금은 **해상도 독립 벡터**다.
 * 바꾼 이유: 8×8은 16px 타일에서 형태가 뭉개져 사람과 집기가 같은 회색 덩어리로 보였다 —
 * 화면이 "테트리스"로 읽히던 원인의 절반이 여기였다(나머지 절반은 휘도 대역 — TileMap 주석).
 *
 * ZEP 등 외부 스프라이트·타일셋을 추출해 쓰지 않는다(대회 제출물이라 실제 저작권 리스크).
 * 참조하는 것은 형식(2D 탑다운)이고, 이는 Gather.town·스타듀밸리·테마 호스피탈이 공유하는 장르 관습이다.
 *
 * ⚠️ **그라디언트를 쓰지 않는다 — 계약이다.** 인라인 SVG가 폰마다 한 벌씩 렌더되므로
 * `<linearGradient id>`를 쓰면 문서 안에 같은 id가 수십 개 생기고, 첫 요소가 언마운트될 때
 * (환자가 퇴원할 때) 나머지의 fill 참조가 어디로 붙는지가 브라우저 구현에 달린다.
 * 대신 **평면 2~3단 셰이딩 램프**로 입체를 만든다 — 현대 2D 벡터 아트의 기본 수법이고 id가 없다.
 *
 * ⚠️ 캐릭터를 손대기 전에 docs/concept/character-design.md를 읽는다 — 이 파일은 **값**의
 * 단일 출처이고, 왜 그 값만 허용되는지(익명 환자·해석 카피 금지·의도적 보류 목록)는 거기에 있다.
 */

/**
 * 과별 가운 강조색 — 채도 낮은 **수술복 톤** 8종. 해석 카피 없이 대조만 만든다.
 *
 * ⚠️ **무채색을 쓰지 않는다 — 계약이다**(테스트가 채널 폭 25로 잠근다). 예전엔 수익과 둘이
 * 회색(`#a1a1aa`·`#71717a`)이라 서로도, 환자 회색과도 안 갈렸다. 유채색 6과는 **색상**으로
 * 구분되니 휘도가 겹쳐도 무해하지만, 무채색은 색상 단서가 없어 **휘도로만** 싸워야 하는데
 * 그 축은 이미 6과가 점유했다 — 그래서 비어 있던 색상(금·녹)을 채웠다.
 *
 * 대조 기준은 바닥이 아니라 **흰 가운**이다(과 색은 가운 안에 보이는 수술복이라 인접면이 가운).
 */
export const DEPT_COLOR: Record<DeptKey, string> = {
  CARDIOLOGY: "#b23a3a",
  THORACIC_SURGERY: "#b56a2c",
  OBSTETRICS: "#b0487a",
  NEUROSURGERY: "#7a52a8",
  GENERAL_SURGERY: "#3a68a8",
  INTERNAL_MEDICINE: "#2f8f86",
  AESTHETICS: "#c8a34a",
  CHECKUP: "#4a7f5a",
};

/** 외곽선 — 순검정이 아니라 어두운 남보라다. 검정은 밝아진 바닥 위에서 스티커처럼 떠 보인다. */
const INK = "#181426";
/** 외곽선 굵기(16 단위계) — **사람과 집기가 같은 값을 쓴다**(2026-07-31). 옛 판은 사람만 0.5~0.55로
 *  굵혀 시선을 끌었는데, 3/4 인물은 면이 잘게 갈려(소매·커프스·앞섶·옷깃) 굵은 선이 그 면들을
 *  덮어 버린다. 인물이 앞에 서는 일은 이제 **시점 차이**가 진다 — 사람만 기울어 있고 집기는 납작하다. */
const EDGE = 0.45;

// 지원자별 초상 변주 — 머리·피부 2슬롯만(character-design.md §1: 실루엣은 하나, 색으로만 구분).
// id 해시 파생이라 결정론(RNG 0). 기본값(변주 키 없음) = 종전과 같은 조합.
const HAIR_VARIANTS = ["#3f3f46", "#1c1917", "#7c5a3a", "#57534e"];
const SKIN_VARIANTS = ["#f0d3b4", "#e3b58a", "#c99a6b"];

/**
 * 문자열 키 → 머리·피부 조합. **결정론이 계약이다**(RNG 0 원칙은 표시 레이어에도 적용된다) —
 * 같은 지원자 id는 언제나 같은 초상이라, 채용 카드와 맵의 아바타가 같은 사람으로 보인다.
 */
export function spriteVariant(key: string): { hair: string; skin: string } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const u = h >>> 0;
  return {
    hair: HAIR_VARIANTS[u % HAIR_VARIANTS.length],
    skin: SKIN_VARIANTS[Math.floor(u / 7) % SKIN_VARIANTS.length],
  };
}

const DEFAULT_LOOK = { hair: "#3f3f46", skin: "#f0d3b4" };

/**
 * 사람 하나 — **실루엣은 이 하나를 공유하고 팔레트만 다르다**(의사·간호사·환자).
 * 다른 종족이 아니라 같은 사람이 어느 자리에 있느냐의 문제라는 것이 이 게임의 주제다.
 *
 * ⚠️ **인물만 3/4 시점이다 — 집기·바닥은 탑다운을 유지한다**(2026-07-31).
 * 정탑다운에서는 **옷이 원래 안 보인다**: 바로 위에서 내려다보면 어깨와 정수리만 보이고 옷의 정보는
 * 전부 앞면에 있는데 그 면이 화면을 안 향한다. 그래서 무엇을 그려도 "어깨에 얹은 무늬"가 되고,
 * 실제로 시안 판정이 *"흰 가운을 입은 것 같지가 않고 그냥 색만 2개 섞은 느낌"*이었다.
 * 시점이 섞이는 것은 감수한다 — 집기가 납작해 시점을 강하게 주장하지 않아 나란히 놓아도 안 어긋난다
 * (시안을 집기 옆에 놓고 실측했다).
 *
 * ⚠️ **과 색은 두 곳에 나온다 — 가슴(수술복)과 소매 끝(커프스).** 가슴 V만 색이면 뇌가 무늬로 읽고,
 * 같은 색이 소매 끝에 **다시** 나와야 레이어로 읽힌다 — "가운 안에 다른 옷을 입었다"가 성립하는
 * 지점이 거기다. 그래서 커프스는 색을 받지 않고 `accent`를 그대로 쓴다 — "같은 색"이 계약이라
 * 다른 색을 넣을 자리가 애초에 없어야 한다. `sleeveCuff`가 나르는 정보는 **가운을 입는가** 하나뿐이라
 * `boolean`이고, 가운을 입는 의사만 넘긴다(간호사·환자는 안 넘겨 안 그려진다).
 *
 * 그리는 순서가 곧 겹침 순서다: 소매 → 커프스 → 수술복 몸통 → 가운 앞섶 좌/우 → 옷깃 좌/우 → 머리 →
 * 머리카락. 셰이딩은 좌우 2단이다 — 왼쪽이 `coat`(밝은 면), 오른쪽이 `coatShade`(그늘진 면).
 */
function Figure({
  coat,
  coatShade,
  accent,
  hair,
  skin,
  sleeveCuff,
}: {
  coat: string;
  coatShade: string;
  accent: string;
  hair: string;
  skin: string;
  sleeveCuff?: boolean;
}) {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      {/* 소매 — 몸통보다 먼저(뒤에) 그린다. 몸통 폭을 줄여 소매가 밖으로 나오게 했다 */}
      <path d="M3.6 7.4 q-1.5 3 -1 5.6 l1.7 .4 q-.4 -3 1 -5.4 Z" fill={coat} stroke={INK} strokeWidth={EDGE} />
      <path d="M12.4 7.4 q1.5 3 1 5.6 l-1.7 .4 q.4 -3 -1 -5.4 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE} />
      {/* 커프스 — 과 색의 두 번째 출현. 이게 없으면 가슴 색이 무늬로 읽힌다(위 계약) */}
      {sleeveCuff && (
        <>
          <path d="M2.5 12.6 l1.7 .4 l-.3 1.4 l-1.7 -.4 Z" fill={accent} stroke={INK} strokeWidth={EDGE} />
          <path d="M13.5 12.6 l-1.7 .4 l.3 1.4 l1.7 -.4 Z" fill={accent} stroke={INK} strokeWidth={EDGE} />
        </>
      )}
      {/* 수술복 몸통 — 가운 앞섶 사이로 보이는 안쪽 옷. 과 색(의사)·계열색(간호사)·회색(환자) */}
      <path d="M6.2 6.6 h3.6 q.9 4.4 .9 8.8 h-5.4 q0 -4.4 .9 -8.8 Z" fill={accent} stroke={INK} strokeWidth={EDGE} />
      {/* 가운 앞섶 — 좌(밝은 면)·우(그늘진 면). 둘 사이 틈이 위 수술복을 드러낸다 */}
      <path d="M6.2 6.4 q-2.6 .6 -2.8 3 q-.4 3.6 0 6.2 h2.6 q-.2 -6 .2 -9.2 Z" fill={coat} stroke={INK} strokeWidth={EDGE} />
      <path d="M9.8 6.4 q2.6 .6 2.8 3 q.4 3.6 0 6.2 h-2.6 q.2 -6 -.2 -9.2 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE} />
      {/* 옷깃 — 앞섶이 목에서 접혀 넘어간 면. 선을 얇게(EDGE×0.7) 해 앞섶 윤곽에 안 지게 한다 */}
      <path d="M6.2 6.4 q.7 1.9 1.8 2.3 q-.5 .8 -1.8 .8 q-.8 -1.6 0 -3.1 Z" fill={coat} stroke={INK} strokeWidth={EDGE * 0.7} />
      <path d="M9.8 6.4 q-.7 1.9 -1.8 2.3 q.5 .8 1.8 .8 q.8 -1.6 0 -3.1 Z" fill={coatShade} stroke={INK} strokeWidth={EDGE * 0.7} />
      {/* 머리 — 3/4라 정원이 아니라 세로로 살짝 긴 타원이다 */}
      <ellipse cx="8" cy="4" rx="2.9" ry="3.1" fill={skin} stroke={INK} strokeWidth={EDGE} />
      {/* 머리카락 — 위쪽을 덮는 호(sweep 1이 y-down에서 위로 지난다) + 이마 선.
          끝점 x는 머리 타원 위의 점이어야 한다: y=3에서 8 ± 2.9·√(1−(1/3.1)²) = 5.255 / 10.745.
          어림값(5.2/10.8)을 쓰면 호 중심이 밀려 머리카락이 머리 외곽선을 덮어 정수리 잉크가 깎인다. */}
      <path d="M5.255 3 A2.9 3.1 0 0 1 10.745 3 q-.9 -.7 -2.745 -.7 q-1.845 0 -2.745 .7 Z" fill={hair} />
      {/*
        ⚠️ **머리에 점을 찍지 않는다.** 구면감을 내려고 왼위에 하이라이트 원을 뒀더니 어두운 머리카락
        위의 흰 점이 **눈 하나**로 읽혔다(160px로 띄워 실측). 표정·얼굴 특징은 금지 규칙이라
        (character-design.md §2·§3 — 환자는 익명, 의사는 개인이 아니다) 우연한 눈도 규칙 위반이다.
        3/4로 옮긴 지금은 얼굴 면이 화면을 향해 더 넓게 열려 있어 **이 금지가 전보다 더 위험하다** —
        입체는 좌우 2단 램프와 옷깃·소매의 겹침이 내고 있으니 얼굴에는 아무것도 얹지 않는다.
      */}
    </svg>
  );
}

/**
 * 의사 — 흰 가운 + 과 색 수술복(가슴)과 커프스(소매 끝). busy면 가운이 밝아진다.
 * variantKey(지원자 id)가 있으면 머리·피부 변주.
 *
 * **`sleeveCuff`를 넘기는 유일한 호출부다** — 커프스는 "가운 **안에** 다른 옷을 입었다"를 말하는
 * 장치라, 가운을 안 입는 간호사·환자에게 붙이면 없는 층을 주장한다(Figure 주석의 계약).
 *
 * ⚠️ **idle 가운은 바닥과 busy 사이에 끼워야 한다** — 위로 붙으면 진료 중이 안 보이고, 아래로
 * 붙으면 이 브랜치가 고친 "바닥에 묻히는 의사"로 되돌아간다. simHud의 `doctorStatusText`가
 * '진료 중'을 **다시 판정하지 않는 근거**가 이 색이라, 대비가 무너지면 카드는 말하는데 화면은
 * 안 말하는 상태가 된다(그 주석의 계약). 실측(raw L = .2126R+.7152G+.0722B):
 * EXAM 바닥 `#d1dee0` 219.4 < idle 234.6 < busy 255 — 바닥과 15.2, busy와 20.4.
 * 두 문턱(바닥+15 · busy−20)이 남기는 창이 [234.4, 235.0]으로 0.6뿐이라 여지가 거의 없다.
 * idle 그늘(224.2)은 바닥보다 4.8 위다 — 그늘진 쪽도 안 묻히게 하느라 idle의 명암 2단 폭(10.4)이
 * busy(22.7)보다 좁은데, 그 좁힘이 이 창의 대가다.
 */
export function DoctorSprite({ dept, busy, variantKey }: { dept: DeptKey; busy: boolean; variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return (
    <Figure
      coat={busy ? "#ffffff" : "#e7ebf1"}
      coatShade={busy ? "#e4e9ee" : "#dbe1e7"}
      accent={DEPT_COLOR[dept]}
      sleeveCuff
      hair={v.hair}
      skin={v.skin}
    />
  );
}

/**
 * 간호사 — **의사 스프라이트의 팔레트 변주**다(실루엣은 하나 — §1).
 *
 * 흰 가운 대신 청록 계열을 입는 것이 유일한 차이이고, 그 한 축이 "이 사람은 진료를 하지 않는다"를
 * 말한다. 강조색에 **과 색을 안 쓰는 것도 계약이다**: 간호사는 과가 없으므로(pawn.hireNurse)
 * 과 색을 빌려 오면 화면이 그를 그 과 소속으로 말하게 된다.
 *
 * **`sleeveCuff`를 안 넘긴다** — 간호사는 가운을 안 입으므로 "가운 안의 다른 옷"이라는 층 자체가
 * 없다(DoctorSprite 주석의 계약). 안 넘기면 그 두 패스가 렌더되지 않는다.
 *
 * `busy`가 없다 — 수납은 인원 판정이라(patientFlow.hasCashier) 간호사에게 "지금 응대 중"이라는
 * 상태 자체가 없다. 없는 축을 색으로 흉내 내면 화면이 시뮬에 없는 사실을 주장한다.
 */
export function NurseSprite({ variantKey }: { variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return <Figure coat="#4fa39e" coatShade="#37827e" accent="#3f8f8b" hair={v.hair} skin={v.skin} />;
}

/**
 * 환자 — 익명 회색. 이름도 사연도 없다(의도적 영구 보류):
 * 개인 서사가 붙으면 "시스템이 문제"가 "이 환자가 안됐다"로 미끄러진다.
 *
 * 강조색(수술복 몸통)은 겉옷보다 **한 단 어둡다** — 같은 회색을 강조에 다시 쓰면 앞섶 사이의
 * 틈이 사라져 회색 덩어리로 보인다(시안에서 실측했다). 익명은 유지하면서 실루엣만 되찾는다.
 * `sleeveCuff`는 안 넘긴다 — 환자복은 가운이 아니다(NurseSprite와 같은 이유).
 */
export function PatientSprite() {
  return <Figure coat="#a8b0b8" coatShade="#8d959d" accent="#98a0a8" hair="#4a4a55" skin="#dcc4a8" />;
}

/**
 * 누운 환자 — **탑다운 예외**다. 서 있는 3/4 인물을 `rotate(90deg)`로 눕히면 "누운 사람"이 아니라
 * **"옆으로 넘어진 사람"**이 된다(3/4는 몸통 앞면이 카메라를 향하는 포즈라, 돌리면 그 앞면이 옆을 본다).
 * 이불 덮은 사람은 위에서 보는 것이 자연스러우므로 이 자세만 탑다운으로 되돌린다.
 *
 * 자세마다 3/4 포즈를 새로 그리지 않는 것이 계약이다 — 그러면 그림이 인물 종류 × 자세로 불어난다.
 *
 * 색은 익명 회색조를 유지하되 `PatientSprite`와 **완전히 같지는 않다**: 피부(`#dcc4a8`)·머리(`#4a4a55`)·
 * 이불(`#98a0a8` = 서 있는 환자의 강조)은 같은 값이고, **겉옷만 한 단 밝다**(`#c9cfd6` ← `#a8b0b8`).
 * 탑다운이라 좌우로 갈리는 2단 램프가 없어 겉옷이 단일 면으로 가기 때문이고, 그래서 `coatShade`
 * (`#8d959d`)에 대응하는 슬롯도 여기엔 없다. 설계서가 이 예외를 열어 뒀다(bright-art-direction §"서 있는
 * 환자와 누운 환자가 다른 그림체가 되는 것을 의도적으로 수용한다").
 *
 * ⚠️ **이중 기재** — 환자 회색조가 `PatientSprite`의 호출 인자와 여기 리터럴 두 곳에 각각 적혀 있다.
 * 환자 회색을 옮기면(설계서 §7이 "환자 회색의 최종 위치"를 미해결로 열어 뒀다) 누운 환자만 조용히
 * 뒤처진다 — 옮길 때 이 두 곳을 같이 본다.
 */
export function LyingPatientSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      {/* 몸 전체(겉옷) → 이불 → 머리 → 머리카락 순. 세로로 긴 캡슐이 곧 누운 실루엣이다. */}
      <rect x="4.6" y="1.2" width="6.8" height="13.6" rx="3" fill="#c9cfd6" stroke={INK} strokeWidth={EDGE} />
      <rect x="4.6" y="6" width="6.8" height="8.8" rx="3" fill="#98a0a8" />
      <ellipse cx="8" cy="3.4" rx="2.4" ry="2.2" fill="#dcc4a8" stroke={INK} strokeWidth={EDGE} />
      <path d="M5.6 2.6 A2.4 2.2 0 0 1 10.4 2.6 Z" fill="#4a4a55" />
    </svg>
  );
}

/*
  집기 — 사람이 아니라 **가구**다. §1 "실루엣은 하나"는 인물 규칙이라 가구엔 적용되지 않는다.
  방을 "빈 상자"가 아니라 진료실로 읽히게 하는 배경이고, 상호작용·게임 상태가 없다.
  톤은 사람보다 낮게 유지한다 — 아바타가 시선을 먼저 받아야 한다.
*/

/**
 * 침대 공통 — 프레임 · 매트리스 · 베개 · 이불. 병동(긴 것)과 진료대(짧은 것)가 공유한다.
 *
 * ⚠️ **빈 침대도 층이 있어야 한다.** 처음엔 프레임과 베개를 거의 같은 밝기로 뒀더니 침대가
 * **특징 없는 흰 사각형** 하나로 보였다(160px 실측 — 방 안에 흰 블록이 떠 있는 모습). 프레임을
 * 한 단 낮추고 매트리스를 안쪽으로 물리고 발치에 접힌 시트를 둬 네 단으로 갈랐다.
 */
function BedFrame({ y, h, occupied }: { y: number; h: number; occupied: boolean }) {
  return (
    <>
      {/* 프레임 — 바닥보다 어둡게. 이게 침대의 윤곽을 진다 */}
      <rect x="1.2" y={y} width="13.6" height={h} rx="1.4" fill="#7e7a72" stroke={INK} strokeWidth={EDGE} />
      {/* 매트리스 — 프레임 안쪽으로 물러난 밝은 면 */}
      <rect x="2.2" y={y + 0.9} width="11.6" height={h - 1.8} rx=".9" fill="#d9d6ce" />
      {/* 베개 — 머리쪽. 어느 쪽이 머리인지 이 하나가 말한다 */}
      <rect x="3.1" y={y + 1.3} width="9.8" height="2.2" rx=".8" fill="#f7f5f1" stroke={INK} strokeWidth=".3" />
      {occupied ? (
        <>
          {/* 이불 두 단(위가 밝다) + 머리 — **전용 그림이 없는 폰**(간호사·의사)이 침대 칸에 있을 때의
              누움 신호다. 환자는 폰 레이어가 `LyingPatientSprite`를 직접 그려 이 두 단을 덮는다(머리 원은
              환자 머리 타원에 완전히 가려지고, 이불은 좌우 띠만 남는다 · TileMap의 occupiedTiles 주석).
              그래도 지우지 않는 이유가 이것이다 — 침대 칸을 지나는 간호사·의사에겐 여전히 이 그림뿐이다. */}
          <rect x="2.2" y={y + 4} width="11.6" height={h - 4.9} rx=".8" fill="#5f7194" />
          <rect x="2.2" y={y + 4} width="11.6" height="1.5" rx=".7" fill="#7f93b8" />
          <circle cx="8" cy={y + 2.4} r="1.4" fill="#e8c9a8" stroke={INK} strokeWidth={EDGE} />
        </>
      ) : (
        /* 발치에 접힌 시트 — 빈 침대가 "정돈된 빈 자리"로 읽히게 하는 네 번째 단 */
        <rect x="2.2" y={y + h - 3.4} width="11.6" height="2.5" rx=".7" fill="#b4bcc9" />
      )}
    </>
  );
}

export function BedSprite({ occupied }: { occupied: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <BedFrame y={0.6} h={14.8} occupied={occupied} />
    </svg>
  );
}

/** 진료대 — 병동 침대보다 짧다(방 안에 들어가야 한다). 늘 비어 있고, 눕는 연출은 폰이 진다. */
export function ExamBedSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <BedFrame y={3.2} h={9.6} occupied={false} />
    </svg>
  );
}

/** 책상 — 상판 + 서류 + 모니터. 진료실이 "책상 있는 방"으로 읽히는 최소 구성이다. */
export function DeskSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="1.4" y="2.2" width="13.2" height="11.6" rx="1" fill="#5f4830" stroke={INK} strokeWidth={EDGE} />
      <rect x="1.4" y="2.2" width="13.2" height="1.4" fill="#8f6f4c" />
      <rect x="2.8" y="5.4" width="5" height="4.6" rx=".4" fill="#efeade" />
      <rect x="3.6" y="6.6" width="3.4" height=".6" fill={INK} opacity=".22" />
      <rect x="3.6" y="8" width="2.6" height=".6" fill={INK} opacity=".22" />
      <rect x="9" y="4.6" width="4.6" height="4.2" rx=".6" fill="#1b2430" stroke={INK} strokeWidth={EDGE} />
      <rect x="9.7" y="5.3" width="3.2" height="1.5" fill="#4b7fa6" opacity=".8" />
    </svg>
  );
}

/* 좌면 앞단 — 몸체 rect(x2.4 y2.6 w11.2 h10.8 rx2.2)의 **아래 띠를 정확히** 따라간다:
   바닥 y=2.6+10.8=13.4, 좌우 x=2.4~13.6, 모서리 반지름 2.2(직선 구간이 x4.6~11.4에서 끝난다).
   그림을 여기 **한 번만** 적는다 — ChairSprite(빈 의자)와 ChairSeatFrontSprite(앉은 폰 위에
   덧까는 층)가 같은 좌면을 그려야 하는데, 문자열을 양쪽에 두면 한쪽만 고쳐져 빈 의자와 앉은
   의자의 좌면 모양이 갈린다. */
function ChairSeatFront() {
  return (
    <path
      d="M2.4 10.6 h11.2 v.6 a2.2 2.2 0 0 1 -2.2 2.2 h-6.8 a2.2 2.2 0 0 1 -2.2 -2.2 Z"
      fill="#343c46"
      stroke={INK}
      strokeWidth={EDGE}
    />
  );
}

/** 대기실 의자 — 등받이 + 좌면 앞단 + 다리. 앉은 폰 위에는 TileMap이 좌면 앞단만 한 겹 더 깐다. */
export function ChairSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="2.2" fill="#3d4550" stroke={INK} strokeWidth={EDGE} />
      <rect x="3.6" y="3.6" width="8.8" height="3.6" rx="1.6" fill="#5b6470" />
      <ChairSeatFront />
      <rect x="4.4" y="13.2" width="2" height="2.2" rx=".6" fill="#2f353e" />
      <rect x="9.6" y="13.2" width="2" height="2.2" rx=".6" fill="#2f353e" />
    </svg>
  );
}

/** 의자 좌면 앞단만 — 앉은 폰 **위에** 덧까는 층이다(왜인지는 TileMap의 해당 레이어 주석). */
export function ChairSeatFrontSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <ChairSeatFront />
    </svg>
  );
}

/** 접수 카운터 — 벽에 붙는 낮은 가구라 위아래로 짧다. 상판 하이라이트가 "카운터 윗면"을 만든다. */
export function CounterSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="0" y="3.4" width="16" height="9.2" fill="#6d5539" stroke={INK} strokeWidth={EDGE} />
      <rect x="0" y="3.4" width="16" height="2.1" fill="#9c7c58" />
      <rect x="0" y="3.4" width="16" height=".5" fill="#c2a179" />
      <rect x="2" y="6.6" width="4.4" height="3" rx=".4" fill="#efeade" />
      <rect x="9.4" y="6.2" width="4.6" height="3.8" rx=".5" fill="#1b2430" />
      <rect x="10.1" y="6.9" width="3.2" height="1.5" fill="#4b7fa6" opacity=".75" />
    </svg>
  );
}

/** 가로수 화분 — 병원 밖 거리 소품. 잎을 원 여러 개로 겹쳐 실루엣이 기계적이지 않게 한다. */
export function PlanterSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="7.2" y="7" width="1.6" height="5" fill="#6b5236" />
      <circle cx="5.6" cy="5.4" r="3" fill="#3f6f4f" />
      <circle cx="10.4" cy="5.6" r="2.8" fill="#3f6f4f" />
      <circle cx="8" cy="3.6" r="3.1" fill="#4c855e" />
      <circle cx="6.9" cy="5.9" r="2.6" fill="#4c855e" />
      <circle cx="7.2" cy="2.9" r="1.2" fill="#5c9a6c" />
      <rect x="4.6" y="11.4" width="6.8" height="3.4" rx=".8" fill="#4a4a55" stroke={INK} strokeWidth={EDGE} />
      <rect x="4.6" y="11.4" width="6.8" height=".9" fill="#63636f" />
    </svg>
  );
}
