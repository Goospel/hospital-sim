import { describe, expect, it } from 'vitest'
import { ALLOWED_ORIGINS, allowedOrigin } from './corsOrigin'

/**
 * 프록시의 문지기 — **이 게임에서 돈이 나가는 유일한 관문**이라 계측기가 있어야 한다.
 *
 * 통과시키면 남의 페이지가 우리 계정으로 LLM을 부르고, 과하게 막으면 배포본이 자기 자신을
 * 403으로 막는다. 둘 다 배포 전에는 안 보이는 실패라 여기서 잰다.
 */
describe('allowedOrigin — 프록시를 부를 수 있는 오리진인가', () => {
  it('Origin이 없으면 거절한다 — 브라우저는 POST에 항상 붙인다(= curl 등 비브라우저)', () => {
    expect(allowedOrigin(null, 'hospital-sim.vercel.app')).toBeNull()
  })

  it('허용 목록의 오리진은 그대로 통과한다 (Pages 배포)', () => {
    for (const origin of ALLOWED_ORIGINS) {
      expect(allowedOrigin(origin, 'hospital-sim.vercel.app')).toBe(origin)
    }
  })

  it('같은 오리진은 목록에 없어도 통과한다 — https·http 둘 다 (배포본의 자기-403 방지)', () => {
    // 이 한 건이 없으면 주 배포(게임과 프록시가 한 도메인)가 통째로 죽는다.
    expect(allowedOrigin('https://hospital-sim.vercel.app', 'hospital-sim.vercel.app'))
      .toBe('https://hospital-sim.vercel.app')
    expect(allowedOrigin('http://localhost:4310', 'localhost:4310')).toBe('http://localhost:4310')
  })

  it('남의 오리진은 거절한다 — 접미사가 겹쳐도 마찬가지', () => {
    expect(allowedOrigin('https://evil.example', 'hospital-sim.vercel.app')).toBeNull()
    // 느슨한 비교(endsWith 등)로 풀면 통과해 버리는 이름 — 정확 일치라야 막힌다.
    expect(allowedOrigin('https://evil-goospel.github.io', 'hospital-sim.vercel.app')).toBeNull()
  })

  it('호스트가 같아도 **포트가 다르면** 다른 오리진이다', () => {
    expect(allowedOrigin('http://localhost:4310', 'localhost:3000')).toBeNull()
  })
})
