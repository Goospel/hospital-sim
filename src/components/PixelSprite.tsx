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
