import type { DeptKey } from "@/game/types";

/**
 * 픽셀 스프라이트 — inline SVG <rect> 격자. 이미지 파일 0개, 번들 영향 0, 정적 export 안전.
 *
 * ZEP 등 외부 스프라이트·타일셋을 추출해 쓰지 않는다(대회 제출물이라 실제 저작권 리스크).
 * 참조하는 것은 형식(2D 탑다운 + 픽셀 그리드)이고, 이는 Gather.town·스타듀밸리·
 * 테마 호스피탈이 공유하는 장르 관습이다.
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

// 8×8 픽셀 인물. '.'=투명 'H'=머리 'S'=피부 'C'=가운 'A'=과 색 강조
const FIGURE = [
  "..HHHH..",
  ".HHHHHH.",
  ".HSSSSH.",
  "..SSSS..",
  ".ACCCCA.",
  ".CCCCCC.",
  "..CC.CC.",
  "..CC.CC.",
];

function PixelGrid({ rows, palette }: { rows: string[]; palette: Record<string, string> }) {
  return (
    <svg viewBox="0 0 8 8" shapeRendering="crispEdges" className="h-full w-full" aria-hidden>
      {rows.flatMap((row, y) =>
        row.split("").map((ch, x) =>
          palette[ch] ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[ch]} /> : null,
        ),
      )}
    </svg>
  );
}

// 지원자별 초상 변주 — 머리·피부 2슬롯만(character-design.md §1: 실루엣은 FIGURE 하나, 색으로만 구분).
// id 해시 파생이라 결정론(RNG 0). 기본값(변주 키 없음) = 종전 렌더와 동일.
const HAIR_VARIANTS = ["#3f3f46", "#1c1917", "#7c5a3a", "#57534e"];
const SKIN_VARIANTS = ["#f0d3b4", "#e3b58a", "#c99a6b"];

function variantOf(key: string): { hair: string; skin: string } {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const u = h >>> 0;
  return {
    hair: HAIR_VARIANTS[u % HAIR_VARIANTS.length],
    skin: SKIN_VARIANTS[Math.floor(u / 7) % SKIN_VARIANTS.length],
  };
}

/** 의사 — 흰 가운 + 과 색 어깨. busy면 가운이 밝아진다. variantKey(지원자 id)가 있으면 머리·피부 변주. */
export function DoctorSprite({ dept, busy, variantKey }: { dept: DeptKey; busy: boolean; variantKey?: string }) {
  const v = variantKey ? variantOf(variantKey) : { hair: "#3f3f46", skin: "#f0d3b4" };
  return (
    <PixelGrid
      rows={FIGURE}
      palette={{ H: v.hair, S: v.skin, C: busy ? "#fafafa" : "#d4d4d8", A: DEPT_COLOR[dept] }}
    />
  );
}

/**
 * 간호사 — **의사 스프라이트의 팔레트 변주**다(실루엣은 FIGURE 하나 — §1).
 *
 * 흰 가운(`#d4d4d8`) 대신 청록 계열을 입는 것이 유일한 차이이고, 그 한 축이 "이 사람은 진료를
 * 하지 않는다"를 말한다. 어깨 강조(A)에 **과 색을 안 쓰는 것도 계약이다**: 간호사는 과가
 * 없으므로(pawn.hireNurse) 과 색을 빌려 오면 화면이 그를 그 과 소속으로 말하게 된다.
 *
 * `busy`가 없다 — 수납은 인원 판정이라(patientFlow.hasCashier) 간호사에게 "지금 응대 중"이라는
 * 상태 자체가 없다. 없는 축을 색으로 흉내 내면 화면이 시뮬에 없는 사실을 주장한다.
 */
export function NurseSprite({ variantKey }: { variantKey?: string }) {
  const v = variantKey ? variantOf(variantKey) : { hair: "#3f3f46", skin: "#f0d3b4" };
  return <PixelGrid rows={FIGURE} palette={{ H: v.hair, S: v.skin, C: "#67e8f9", A: "#0e7490" }} />;
}

/**
 * 환자 — 익명 회색. 이름도 사연도 없다(의도적 영구 보류):
 * 개인 서사가 붙으면 "시스템이 문제"가 "이 환자가 안됐다"로 미끄러진다.
 */
export function PatientSprite() {
  return <PixelGrid rows={FIGURE} palette={{ H: "#52525b", S: "#d6c3ae", C: "#8b8b93", A: "#8b8b93" }} />;
}

// 침대 — 위에서 본 8×8. 'F'=프레임 'M'=매트리스 'P'=베개
const BED = [
  "FFFFFFFF",
  "FPPPPPPF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FFFFFFFF",
];

export function BedSprite({ occupied }: { occupied: boolean }) {
  return (
    <PixelGrid
      rows={BED}
      palette={{ F: "#3f3f46", P: "#e4e4e7", M: occupied ? "#4b5563" : "#27272a" }}
    />
  );
}

/*
  진료실·대기실·거리 가구 — 사람이 아니라 **집기**다. §1 "실루엣은 FIGURE 하나"는 인물 규칙이라
  가구엔 적용되지 않는다(BED와 같은 결). 방을 "빈 상자"가 아니라 진료실로 읽히게 하는 배경이고,
  상호작용·게임 상태가 없다. 색은 데스크 팔레트 계열로 낮춰 아바타(사람)가 시선을 먼저 받게 한다.
*/

// 진료대 — 위에서 본 짧은 침대(베개 있는 쪽이 머리). 병동 BED보다 작아 방 안에 들어간다.
const EXAM_BED = [
  "........",
  "FFFFFFFF",
  "FPPMMMMF",
  "FMMMMMMF",
  "FMMMMMMF",
  "FFFFFFFF",
  "........",
  "........",
];

export function ExamBedSprite() {
  return <PixelGrid rows={EXAM_BED} palette={{ F: "#3f3f46", P: "#c8c8cf", M: "#2f2f38" }} />;
}

// 책상 — 위에서 본 상판 + 서류 두 장.
const DESK = [
  "........",
  ".DDDDDD.",
  ".DWWWWD.",
  ".DWPPWD.",
  ".DWWWWD.",
  ".DDDDDD.",
  "........",
  "........",
];

export function DeskSprite() {
  return <PixelGrid rows={DESK} palette={{ D: "#4a3f33", W: "#6b5a45", P: "#d8d3c0" }} />;
}

// 대기실 의자 — 위에서 본 등받이 + 좌면.
const CHAIR = [
  "........",
  ".BBBBBB.",
  ".BSSSSB.",
  ".BSSSSB.",
  ".BSSSSB.",
  ".BBBBBB.",
  "..B..B..",
  "........",
];

export function ChairSprite() {
  return <PixelGrid rows={CHAIR} palette={{ B: "#3f3f46", S: "#2b2b33" }} />;
}

// 가로수 화분 — 병원 밖 거리 소품(잎·줄기·화분).
const PLANTER = [
  "..GGGG..",
  ".GGGGGG.",
  ".GGGGGG.",
  "..GGGG..",
  "...TT...",
  "..PPPP..",
  "..PPPP..",
  "........",
];

export function PlanterSprite() {
  return <PixelGrid rows={PLANTER} palette={{ G: "#3f6f4f", T: "#5a4632", P: "#3a3a44" }} />;
}
