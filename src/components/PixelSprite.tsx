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

/** 과별 가운 강조색. 필수과는 채도 있는 색, 수익과는 옅은 색 — 해석 카피 없이 대조만 만든다. */
export const DEPT_COLOR: Record<DeptKey, string> = {
  CARDIOLOGY: "#ef4444",
  THORACIC_SURGERY: "#f97316",
  OBSTETRICS: "#ec4899",
  NEUROSURGERY: "#a855f7",
  GENERAL_SURGERY: "#3b82f6",
  INTERNAL_MEDICINE: "#14b8a6",
  AESTHETICS: "#a1a1aa",
  CHECKUP: "#71717a",
};

/** 외곽선 — 순검정이 아니라 어두운 남보라다. 검정은 밝아진 바닥 위에서 스티커처럼 떠 보인다. */
const INK = "#181426";
/** 집기 공통 외곽선 굵기(16 단위계). 사람보다 얇게 — 사람이 시선을 먼저 받아야 한다. */
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
 * 셰이딩은 세 단이다: 밑단(`coatShade`)을 깔고 → 상단에 밝은 톤(`coat`)을 덮고 → 어깨에 강조색.
 * 머리는 원 하나 + 위 절반을 덮는 머리카락 호 + 왼위 하이라이트 점으로 구면감을 낸다.
 */
function Figure({
  coat,
  coatShade,
  accent,
  hair,
  skin,
}: {
  coat: string;
  coatShade: string;
  accent: string;
  hair: string;
  skin: string;
}) {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      {/* 다리 — 몸통보다 먼저(뒤에) 그려 밑단이 겹치게 한다 */}
      <rect x="5.6" y="12.1" width="1.9" height="3.3" rx=".7" fill={coatShade} stroke={INK} strokeWidth=".5" />
      <rect x="8.5" y="12.1" width="1.9" height="3.3" rx=".7" fill={coatShade} stroke={INK} strokeWidth=".5" />
      {/* 몸통 — 어두운 톤 전체 */}
      <rect x="4.2" y="7.1" width="7.6" height="6.3" rx="1.7" fill={coatShade} stroke={INK} strokeWidth=".55" />
      {/* 상단 하이라이트 — 두 번째 단 */}
      <rect x="4.8" y="7.5" width="6.4" height="3.5" rx="1.3" fill={coat} />
      {/* 어깨 강조 — 과 색(의사) · 계열색(간호사) · 회색(환자)이 전부 이 두 칸에 든다 */}
      <rect x="4.2" y="7.7" width="1.6" height="3.1" rx=".7" fill={accent} />
      <rect x="10.2" y="7.7" width="1.6" height="3.1" rx=".7" fill={accent} />
      {/* 림 라이트 — 어깨 위 한 줄. 인물을 바닥에서 떼어 놓는다 */}
      <rect x="5.2" y="7.4" width="5.6" height=".45" fill="#ffffff" opacity=".22" />
      {/* 머리 */}
      <circle cx="8" cy="4.6" r="3" fill={skin} stroke={INK} strokeWidth=".55" />
      {/* 머리카락 — 위 절반을 덮는 호(sweep 1이 y-down에서 위로 지난다) */}
      <path d="M5.05 4.35a2.95 2.95 0 0 1 5.9 0z" fill={hair} />
      {/* 목 그늘 — 머리와 몸통을 붙인다. 없으면 머리가 떠 보인다 */}
      <rect x="6.8" y="6.9" width="2.4" height=".8" fill={INK} opacity=".32" />
      {/*
        ⚠️ **머리에 점을 찍지 않는다.** 구면감을 내려고 왼위에 하이라이트 원을 뒀더니 어두운 머리카락
        위의 흰 점이 **눈 하나**로 읽혔다(160px로 띄워 실측). 표정·얼굴 특징은 금지 규칙이라
        (character-design.md §2·§3 — 환자는 익명, 의사는 개인이 아니다) 우연한 눈도 규칙 위반이다.
        입체는 위 어깨 림 라이트와 몸통 2단 램프가 이미 내고 있어 이 점이 없어도 평면으로 안 보인다.
      */}
    </svg>
  );
}

/** 의사 — 흰 가운 + 과 색 어깨. busy면 가운이 밝아진다. variantKey(지원자 id)가 있으면 머리·피부 변주. */
export function DoctorSprite({ dept, busy, variantKey }: { dept: DeptKey; busy: boolean; variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return (
    <Figure
      coat={busy ? "#ffffff" : "#dcdce2"}
      coatShade={busy ? "#c9c9d2" : "#a9a9b4"}
      accent={DEPT_COLOR[dept]}
      hair={v.hair}
      skin={v.skin}
    />
  );
}

/**
 * 간호사 — **의사 스프라이트의 팔레트 변주**다(실루엣은 하나 — §1).
 *
 * 흰 가운 대신 청록 계열을 입는 것이 유일한 차이이고, 그 한 축이 "이 사람은 진료를 하지 않는다"를
 * 말한다. 어깨 강조에 **과 색을 안 쓰는 것도 계약이다**: 간호사는 과가 없으므로(pawn.hireNurse)
 * 과 색을 빌려 오면 화면이 그를 그 과 소속으로 말하게 된다.
 *
 * `busy`가 없다 — 수납은 인원 판정이라(patientFlow.hasCashier) 간호사에게 "지금 응대 중"이라는
 * 상태 자체가 없다. 없는 축을 색으로 흉내 내면 화면이 시뮬에 없는 사실을 주장한다.
 */
export function NurseSprite({ variantKey }: { variantKey?: string }) {
  const v = variantKey ? spriteVariant(variantKey) : DEFAULT_LOOK;
  return <Figure coat="#7de9f9" coatShade="#3fa8c2" accent="#0e7490" hair={v.hair} skin={v.skin} />;
}

/**
 * 환자 — 익명 회색. 이름도 사연도 없다(의도적 영구 보류):
 * 개인 서사가 붙으면 "시스템이 문제"가 "이 환자가 안됐다"로 미끄러진다.
 *
 * 어깨 강조는 가운보다 **한 단 어둡다** — 같은 회색을 강조에 다시 쓰면 어깨가 사라져
 * 회색 덩어리로 보인다(시안에서 실측했다). 익명은 유지하면서 실루엣만 되찾는다.
 */
export function PatientSprite() {
  return <Figure coat="#a5a5b0" coatShade="#75757f" accent="#63636f" hair="#4a4a55" skin="#dcc4a8" />;
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
          {/* 이불 — 두 단(위가 밝다). 사람이 누워 있다는 신호는 이불 + 머리 하나로 충분하다 */}
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

/** 대기실 의자 — 등받이 + 좌면. 앉은 폰이 SEAT_LIFT만큼 들리면 아랫단이 밑으로 드러난다(TileMap). */
export function ChairSprite() {
  return (
    <svg viewBox="0 0 16 16" className="h-full w-full" aria-hidden>
      <rect x="2.4" y="2.6" width="11.2" height="10.8" rx="2.2" fill="#3d4550" stroke={INK} strokeWidth={EDGE} />
      <rect x="3.6" y="3.6" width="8.8" height="3.6" rx="1.6" fill="#5b6470" />
      <rect x="4.4" y="13.2" width="2" height="2.2" rx=".6" fill="#2f353e" />
      <rect x="9.6" y="13.2" width="2" height="2.2" rx=".6" fill="#2f353e" />
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
