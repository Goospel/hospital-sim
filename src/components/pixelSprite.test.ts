import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { spriteVariant, DEPT_COLOR, CHAIR_PALETTE, DoctorSprite } from './PixelSprite'
import { relativeLuminance } from './Backdrop'
import { CHAIR_VARIANTS } from './simHud'
import type { DeptKey } from '@/game/types'

/**
 * 스프라이트에서 **판단이 드는 유일한 자리**를 잠근다 — 그리기(패스 좌표)는 눈이 판정하지만
 * 초상 변주는 계약이다: 같은 지원자 id가 언제나 같은 얼굴이어야 채용 카드와 맵의 아바타가
 * 같은 사람으로 읽힌다(RNG 0 원칙이 표시 레이어에도 적용된다 — character-design.md §4).
 *
 * 벡터 전환(2026-07-30)에서 이 함수는 `variantOf`(비공개) → `spriteVariant`(공개)로 나왔다.
 * 공개한 이유가 곧 이 파일이다: 결정론은 눈으로 검수할 수 없다.
 */
describe('spriteVariant — 초상 변주는 id의 순수 함수다', () => {
  const KEYS = ['d1', 'd2', 'd17', 'cand-abc', '의사-3', '', 'x'.repeat(64)]

  it.each(KEYS)('같은 키(%s)는 항상 같은 조합을 준다', (key) => {
    const a = spriteVariant(key)
    expect(spriteVariant(key)).toEqual(a)
    expect(spriteVariant(key)).toEqual(a) // 세 번째 호출까지 — 내부 상태가 없음을 못박는다
  })

  it('머리·피부가 실제 후보 목록 안에서만 나온다 — 범위를 벗어나면 화면에 빈 색이 뜬다', () => {
    for (const key of KEYS) {
      const { hair, skin } = spriteVariant(key)
      expect(hair, `hair ${hair}`).toMatch(/^#[0-9a-f]{6}$/)
      expect(skin, `skin ${skin}`).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  /** 변주가 **실제로 갈리는지** — 늘 같은 값을 돌려주면 위 결정론 테스트는 통과하면서 목적이 증발한다. */
  it('서로 다른 키들이 한 조합으로 뭉치지 않는다', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => JSON.stringify(spriteVariant(`d${i}`))))
    expect(seen.size, `40개 키에서 조합 ${seen.size}종`).toBeGreaterThanOrEqual(4)
  })

  /**
   * 머리 모양 축 — 2026-08-03 신설. 머리4×피부3=12조합으로는 18명 명부의 **대형 초상**에서
   * 같은 얼굴이 눈에 띄게 반복됐다(채용 패널 재설계 스펙 §3). 세 번째 축을 더해 36조합이 된다.
   * 형태는 눈이 판정하지만 **어느 키가 어느 형태인가**는 계약이라 여기서 잠근다.
   */
  it('hairStyle이 0·1·2 중 하나이고, 같은 키는 항상 같은 형태다', () => {
    for (const key of KEYS) {
      const s = spriteVariant(key).hairStyle
      expect([0, 1, 2], `key "${key}" → ${s}`).toContain(s)
      expect(spriteVariant(key).hairStyle, `key "${key}"`).toBe(s)
    }
  })

  /** 세 형태가 실제로 다 쓰이는지 — 한 값으로 굳으면 위 범위 테스트는 통과하면서 축이 증발한다. */
  it('세 형태가 전부 나온다', () => {
    const seen = new Set(Array.from({ length: 40 }, (_, i) => spriteVariant(`d${i}`).hairStyle))
    expect([...seen].sort(), `40개 키에서 형태 ${[...seen].sort().join(',')}`).toEqual([0, 1, 2])
  })

  /**
   * 축 독립 — `hair = u%4` · `skin = (u/7)%3` · `hairStyle = (u/29)%3`은 제수가 서로 달라
   * 따로 움직인다. 한 축이 다른 축을 따라가면 조합이 36이 아니라 12로 되돌아간다.
   * 실례 두 키를 박아 둔다: 머리색이 같은데 형태가 갈리는 쌍이 실제로 존재해야 한다.
   */
  it('머리색이 같아도 머리 모양은 갈린다 (d1 ↔ d12)', () => {
    const a = spriteVariant('d1'), b = spriteVariant('d12')
    expect(a.hair, `d1 ${a.hair} vs d12 ${b.hair}`).toBe(b.hair)
    expect(a.hairStyle, `둘 다 형태 ${a.hairStyle}`).not.toBe(b.hairStyle)
  })

  /**
   * 형태 축의 **배선** — 위 테스트들은 전부 `spriteVariant`의 반환값만 보므로 `HAIR_PATHS[hairStyle]`을
   * `HAIR_PATHS[0]`으로 바꿔도 전원 초록이다(리뷰 2026-08-03 돌연변이 실측). 36조합은 계산이 아니라
   * **그려져야** 뜻이 있으니 렌더 결과에서 잰다.
   *
   * d1↔d12는 머리색이 같은 쌍이라(위 축 독립 테스트) 두 마크업의 유일한 차이가 머리카락 path다 —
   * 색은 `d`에 안 실리고 얼굴·몸은 형태를 안 받으므로, `d` 목록이 갈리면 그 원인은 이 배선뿐이다.
   */
  it('머리 형태가 렌더까지 배선된다 — d1↔d12의 path 좌표가 갈린다', () => {
    const paths = (key: string) => {
      const svg = renderToStaticMarkup(
        createElement(DoctorSprite, { dept: 'CARDIOLOGY' as DeptKey, busy: false, variantKey: key }),
      )
      return [...svg.matchAll(/ d="([^"]+)"/g)].map(m => m[1])
    }
    const [a, b] = [paths('d1'), paths('d12')]
    expect(a.length, '패스 수').toBeGreaterThan(0)
    expect(a.length, '두 초상의 패스 수는 같다(형태만 갈린다)').toBe(b.length)
    expect(a, `d1 형태 ${spriteVariant('d1').hairStyle} vs d12 형태 ${spriteVariant('d12').hairStyle}`).not.toEqual(b)
  })

  it('과 색은 8과 전부에 있고 서로 다르다 — 가슴 수술복과 소매 커프스가 과를 나르는 신호다', () => {
    const depts = Object.keys(DEPT_COLOR) as DeptKey[]
    expect(depts).toHaveLength(8)
    for (const d of depts) expect(DEPT_COLOR[d], d).toMatch(/^#[0-9a-f]{6}$/)
    // 8과가 각자 다른 색상을 쓴다(무채색 폐지 이후). 같은 색이면 화면에서 과가 구별되지 않는다.
    expect(new Set(Object.values(DEPT_COLOR)).size).toBe(8)
  })

  /**
   * ⚠️ **대조 대상이 바닥이 아니라 흰 가운(255)인 이유**: 과 색은 가운 안에 보이는 수술복이라
   * 인접한 면이 가운이다. 바닥은 과 색과 맞닿지 않으므로 바닥 기준으로 재면 화면에서 실제로
   * 겪는 대비를 재는 게 아니다(설계 단계에서 바닥 기준으로 쟀다가 미용·피부가 걸렸는데,
   * 그건 미용 색의 결함이 아니라 잣대의 결함이었다 — 가운 기준으로는 54.3 vs 90.6).
   */
  it('과 색은 흰 가운과 충분히 갈린다 — 가운 안에 보이는 색이라 대조 대상은 바닥이 아니라 가운이다', () => {
    const COAT = 255
    for (const [dept, hex] of Object.entries(DEPT_COLOR)) {
      const L = relativeLuminance(hex)
      expect(COAT - L, `${dept}(${hex}) = ${L.toFixed(1)}`).toBeGreaterThanOrEqual(70)
    }
  })

  it('무채색 과가 없다 — 색상이 없으면 휘도로만 싸워야 하는데 그 축은 이미 6과가 쓴다', () => {
    for (const [dept, hex] of Object.entries(DEPT_COLOR)) {
      const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16)
      const spread = Math.max(r, g, b) - Math.min(r, g, b)
      expect(spread, `${dept}(${hex}) 채널 폭 ${spread}`).toBeGreaterThanOrEqual(25)
    }
  })
})

/*
  ── 의자 변종 팔레트 ────────────────────────────────────────────────────────
  그림(패스 좌표)은 눈이 판정한다 — 이 저장소의 스프라이트 관행이다. 여기서 재는 것은
  **판단이 드는 값**뿐이다: 다섯이 실제로 갈리는가, 사람보다 어두운가, 셰이딩이 뒤집히지 않았는가.
*/
describe('의자 변종 팔레트 — 다섯이 실제로 갈린다', () => {
  /** HSL 색상·채도. 「채도」를 함께 재는 이유는 아래 분리 계약의 주석에 있다. */
  function hueSat(hex: string): { h: number; s: number } {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2
    if (d === 0) return { h: 0, s: 0 }
    const h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4)
    return { h: (h + 360) % 360, s: (d / (1 - Math.abs(2 * l - 1))) * 100 }
  }
  const hueGap = (a: number, b: number) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

  it('다섯 변종이 전부 네 색(body·accent·seat·leg)을 갖는다', () => {
    expect(Object.keys(CHAIR_PALETTE).sort()).toEqual([...CHAIR_VARIANTS].sort())
    for (const v of CHAIR_VARIANTS) {
      const p = CHAIR_PALETTE[v]
      for (const slot of ['body', 'accent', 'seat', 'leg'] as const) {
        expect(p[slot], `${v}.${slot}`).toMatch(/^#[0-9a-f]{6}$/)
      }
    }
  })

  /** 셰이딩 램프의 **방향**이 계약이다. accent가 body보다 어두우면 등받이·쿠션이 사라지고
   *  좌면이 몸체보다 밝으면 앞단이 튀어나온 게 아니라 파인 것처럼 읽힌다. */
  it('변종 안에서 accent > body > seat > leg 순으로 어두워진다', () => {
    for (const v of CHAIR_VARIANTS) {
      const p = CHAIR_PALETTE[v]
      const [a, b, s, g] = [p.accent, p.body, p.seat, p.leg].map(relativeLuminance)
      expect(a, `${v} accent ${a.toFixed(1)} vs body ${b.toFixed(1)}`).toBeGreaterThan(b)
      expect(b, `${v} body ${b.toFixed(1)} vs seat ${s.toFixed(1)}`).toBeGreaterThan(s)
      expect(s, `${v} seat ${s.toFixed(1)} vs leg ${g.toFixed(1)}`).toBeGreaterThan(g)
    }
  })

  /** 「집기 톤은 사람보다 낮게 — 아바타가 시선을 먼저 받는다」(PixelSprite 집기 절 머리말).
   *  대조 대상은 **사람 중 가장 어두운 것**(간호사 가운 `#4fa39e`)이다. 지배 면인 `body`로 잰다 —
   *  세부까지 묶으면 이미 있는 집기가 규칙을 어긴 것이 된다(침대 베개 `#f7f5f1`는 245다). */
  it('몸체가 사람보다 어둡다 — 간호사 가운과 20 이상 벌어진다', () => {
    const NURSE = relativeLuminance('#4fa39e')
    for (const v of CHAIR_VARIANTS) {
      const L = relativeLuminance(CHAIR_PALETTE[v].body)
      expect(NURSE - L, `${v}(${CHAIR_PALETTE[v].body}) = ${L.toFixed(1)}`).toBeGreaterThanOrEqual(20)
    }
  })

  /**
   * 쌍별 분리 — **휘도로 갈리거나, 둘 다 유채색이면서 색상으로 갈리거나**.
   *
   * ⚠️ **채도 하한이 이 단언의 핵심이다.** 그것 없이 색상만 보면 무채색 회색이 "색상 178°로
   * 갈린다"고 주장하는데 채도 4%에서 색상은 뜻이 없다 — **통과하면서 아무것도 안 지키는**
   * T-144의 형태다. 실제로 첫 벤치 후보(#6a6e72, 채도 3.8%)가 여기 걸려 지금 값으로 바뀌었다.
   */
  it('두 변종끼리 반드시 갈린다 — 휘도 12 이상, 또는 양쪽 채도 12% 이상에서 색상 40° 이상', () => {
    for (let i = 0; i < CHAIR_VARIANTS.length; i++) {
      for (let j = i + 1; j < CHAIR_VARIANTS.length; j++) {
        const [va, vb] = [CHAIR_VARIANTS[i], CHAIR_VARIANTS[j]]
        const [ha, hb] = [CHAIR_PALETTE[va].body, CHAIR_PALETTE[vb].body]
        const dL = Math.abs(relativeLuminance(ha) - relativeLuminance(hb))
        const [ca, cb] = [hueSat(ha), hueSat(hb)]
        const byHue = ca.s >= 12 && cb.s >= 12 && hueGap(ca.h, cb.h) >= 40
        expect(
          dL >= 12 || byHue,
          `${va}(${ha}) ↔ ${vb}(${hb}): ΔL=${dL.toFixed(1)} Δ색상=${hueGap(ca.h, cb.h).toFixed(0)}° 채도 ${ca.s.toFixed(0)}/${cb.s.toFixed(0)}%`,
        ).toBe(true)
      }
    }
  })

  /** 앉은 폰 위에 덧까는 층도 변종끼리 갈려야 한다 — 좌면만 보이는 각도가 실제로 생긴다. */
  it('좌면 색도 서로 같지 않다', () => {
    expect(new Set(CHAIR_VARIANTS.map(v => CHAIR_PALETTE[v].seat)).size).toBe(CHAIR_VARIANTS.length)
  })

  /** 기본 변종이 **옛 의자 그대로**임을 못박는다 — 이 네 값이 밀리면 기존 화면이 조용히 바뀐다. */
  it('플라스틱 네 색이 전환 전 의자와 같다', () => {
    expect(CHAIR_PALETTE.PLASTIC).toEqual({
      body: '#3d4550', accent: '#5b6470', seat: '#343c46', leg: '#2f353e',
    })
  })
})
