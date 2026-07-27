// 테스트 전용 헬퍼 — **프로덕션 코드에서 임포트하지 않는다**(`src/app`·`src/components`와
// `src/sim`의 구현 파일 어디에서도 이 파일을 부르지 않는다). 여기 있는 것은 게임 규칙이 아니라
// *테스트가 전제를 세우는 방식*이고, 화면이 그 방식을 물려받으면 실패 경로가 통째로 사라진다:
// 아래 `hire`는 채용 거부를 **던진다**. 화면이 이걸 쓰면 풀이 빈 과를 누르는 순간 앱이 죽는다
// (화면의 계약은 정반대다 — 거부를 토스트로 말하고 세계는 그대로 둔다: /sim page.tsx).
//
// 왜 모았나: 같은 언랩이 8개 테스트 파일에 **바이트 동일**로 복제돼 있었다. 복제 자체는 짧아
// 무해해 보이지만, `HireResult`의 모양이 바뀌는 날(거부 사유가 늘거나 ok의 페이로드가 갈리는 날)
// 고칠 자리가 여덟 곳이고 **한 곳만 잊어도 그 파일만 조용히 옛 계약으로 돈다**.
//
// ⚠️ 상대 경로 임포트 — vitest에 `@/` 별칭이 없다(simHud.ts 머리말과 같은 제약).
import type { SimDeptKey } from './dept'
import { hireDoctor } from './pawn'
import type { SimWorld } from './world'

/**
 * 채용 성공을 **전제**로 세계만 꺼낸다 — 풀 고갈(NO_POOL)은 이 헬퍼를 쓰는 파일의 관심사가
 * 아니다(그 계약은 resignation.test.ts가 따로 잰다).
 *
 * 거부를 던지는 것이 핵심이다: 실패를 입력 세계로 접으면(`r.ok ? r.world : w`) 픽스처가
 * 의사 없이 세워지고, 그 뒤의 단언들은 **아무것도 관측하지 않은 채 통과**한다. 전국 풀은
 * 과마다 2~8명뿐이라(dept.ts nationalPool) 픽스처가 사람을 여럿 뽑기 시작하면 실제로 닿는
 * 경계다 — 조용히 통과하느니 터지는 편이 낫다.
 */
export function hire(w: SimWorld, dept: SimDeptKey): SimWorld {
  const r = hireDoctor(w, dept)
  if (!r.ok) throw new Error(`전제 실패 — 채용 거부(${r.reason})`)
  return r.world
}
