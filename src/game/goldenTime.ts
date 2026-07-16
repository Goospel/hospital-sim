/**
 * 골든타임 타이머 — 환자가 살 수 있는 남은 시간(초).
 * 순수·불변으로 모델링한다(Date.now 미사용). 시간은 게임 이벤트가 명시적으로 흘린다.
 */
export interface GoldenTimer {
  totalSeconds: number
  remainingSeconds: number
}

/** 총 골든타임으로 타이머를 만든다. */
export function createGoldenTimer(totalSeconds: number): GoldenTimer {
  return { totalSeconds, remainingSeconds: totalSeconds }
}

/** elapsedSeconds 만큼 시간을 흘린 새 타이머를 반환한다(원본 불변). */
export function advance(timer: GoldenTimer, elapsedSeconds: number): GoldenTimer {
  if (elapsedSeconds < 0) {
    throw new Error(`elapsedSeconds must be >= 0, got ${elapsedSeconds}`)
  }
  return {
    ...timer,
    remainingSeconds: Math.max(0, timer.remainingSeconds - elapsedSeconds),
  }
}

/** 남은 시간이 소진됐는가. */
export function isExpired(timer: GoldenTimer): boolean {
  return timer.remainingSeconds <= 0
}
