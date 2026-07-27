"use client";

import { formatManwon } from "@/game/labels";
import { HIRABLE_DEPTS, simDept, type SimDeptKey } from "@/sim/dept";
import type { Pawn } from "@/sim/pawn";
import { doctorCountByDept } from "./simHud";

/**
 * 채용 패널 — 이 게임에서 플레이어가 내리는 **첫 결정**이 여기서 일어난다(개원 시 의사 0명).
 *
 * 화면의 요지는 "누구를 뽑을까"가 아니라 **뽑는 순간 주급이 확정된다**는 것이다. 그래서 각 줄에
 * 주급을 나란히 놓고, 아래에 지금 병원이 매주 무는 고정비 합계를 둔다 — 필수과를 채울수록
 * 그 숫자가 커지는 걸 채용 화면에서 이미 보게 하는 게 이 슬라이스의 논지다.
 *
 * 계산은 하지 않는다: 인원은 폰에서(doctorCountByDept), 주급은 카탈로그에서(simDept) 그대로
 * 읽는다. 여기서 다시 세면 결산의 고정비와 조용히 갈린다.
 *
 * ⚠️ **채용 일시금은 없다**(hireDoctor — 금고 무변). 이 패널이 금고를 보여주되 "잔액 부족"
 * 같은 판정을 하지 않는 이유다: 채용의 대가는 지금이 아니라 주말에 온다.
 */
export default function HirePanel({
  pawns,
  treasuryManwon,
  onHire,
  onClose,
}: {
  pawns: Pawn[];
  treasuryManwon: number;
  onHire: (dept: SimDeptKey) => void;
  onClose: () => void;
}) {
  const counts = doctorCountByDept(pawns);
  const weeklyTotal = HIRABLE_DEPTS.reduce((sum, k) => sum + counts[k] * simDept(k).weeklyCostManwon, 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="의사 채용"
      /* 세로 가운데는 아이의 `my-auto`로 잡는다(T-088) — 스크롤 컨테이너에서 items-center는
         내용이 뷰포트보다 길어지면 아이의 위쪽을 스크롤로 닿을 수 없는 곳으로 밀어낸다. */
      className="fixed inset-0 z-20 flex items-start justify-center overflow-y-auto bg-desk/85 p-4"
    >
      <div className="my-auto flex w-full max-w-md flex-col gap-3 border border-frame bg-desk-2 px-5 py-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-on-desk">의사 채용</h2>
          <span className="font-mono text-xs tabular-nums text-on-desk-muted">
            금고 {treasuryManwon.toLocaleString()}만원
          </span>
        </div>

        {/* 해석 카피 없이 사실만 — "필수과는 적자입니다" 같은 문장을 쓰지 않는다. 주급 표가
            나란히 서 있으면 대조는 플레이어가 읽는다. */}
        <p className="text-xs text-on-desk-muted">
          채용에 일시금은 없습니다. 비용은 매주 결산에서 주급으로 청구됩니다.
        </p>

        <ul className="flex flex-col divide-y divide-frame border-y border-frame">
          {HIRABLE_DEPTS.map((key) => {
            const spec = simDept(key);
            return (
              <li key={key} className="flex items-center gap-3 py-2.5">
                <span className="min-w-24 text-sm text-on-desk">{spec.label}</span>
                <span className="font-mono text-xs tabular-nums text-on-desk-muted">
                  현재 {counts[key]}명
                </span>
                <span className="ml-auto font-mono text-xs tabular-nums text-on-desk-muted">
                  주급 {formatManwon(spec.weeklyCostManwon)}
                </span>
                <button
                  type="button"
                  onClick={() => onHire(key)}
                  className="border border-frame px-3 py-1 text-xs text-on-desk-muted transition-colors hover:border-on-desk-muted hover:text-on-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
                >
                  채용
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex items-baseline justify-between font-mono text-xs tabular-nums">
          <span className="font-sans text-on-desk-muted">주 고정비 합계</span>
          <span className="text-on-desk">{formatManwon(weeklyTotal)}</span>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-1 rounded-xs border border-frame bg-desk py-2.5 text-sm font-medium text-on-desk transition-colors hover:bg-frame focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-on-desk-muted"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
