import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import TileMap from './TileMap'
import { createWorld } from '@/sim/world'

/**
 * 격자는 **배치 보조선**이다 — 도구를 들었을 때만 뜬다.
 *
 * 평시에 격자가 깔려 있으면 부지가 늘 모눈종이로 보인다. 타일 경계는 평시에도 바닥 줄눈
 * (부지 테두리 boxShadow·영역 색)이 이미 내고 있어, 격자가 더할 정보는 "어디에 놓이는가"뿐이다.
 * 그 질문은 건설 중에만 존재한다.
 *
 * ⚠️ **DOM 없이 정적 마크업으로 잰다** — 이 저장소엔 jsdom·testing-library가 없다
 * (`hirePanel.test.tsx`의 같은 주석이 단일 출처). `useEffect`가 안 도는 SSR 렌더라
 * 카메라 측정·배경 캔버스는 비지만, 격자는 **렌더 시점의 인라인 style**이라 그대로 잡힌다.
 */

const render = (buildReady: boolean) =>
  renderToStaticMarkup(<TileMap world={createWorld(1)} stepMs={0} buildReady={buildReady} />)

describe('부지 격자 — 건설 중에만 보인다', () => {
  it('도구를 안 들었으면 격자가 없다', () => {
    expect(render(false)).not.toContain('repeating-linear-gradient')
  })

  it('도구를 들면 격자가 깔린다', () => {
    expect(render(true)).toContain('repeating-linear-gradient')
  })

  it('격자 말고는 그대로다 — 바닥색과 부지 테두리는 두 상태가 같다', () => {
    // 조건을 다는 김에 바닥·테두리까지 지워 버리면 부지 자체가 사라진다(같은 style 객체다).
    for (const markup of [render(false), render(true)]) {
      expect(markup).toContain('inset 0 0 0 1px var(--frame)')
      expect(markup).toContain('background-color:#abb1b5')
    }
  })
})
