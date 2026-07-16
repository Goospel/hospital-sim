"use client";

import { useState, type ReactNode } from "react";
import { buildDebrief } from "@/game/debrief";
import { buildLedger } from "@/game/ledger";
import { startGame, type GameState } from "@/game/round";
import { createStemiScenario } from "@/game/scenarios";
import EmergencyChrome from "./EmergencyChrome";
import LedgerPanel from "./LedgerPanel";
import Receipt from "./Receipt";
import TransferRound, { LOW_TIME_THRESHOLD } from "./TransferRound";

function newGame(): GameState {
  const s = createStemiScenario();
  return startGame(s.patient, s.hospitals, s.goldenSeconds);
}

/**
 * 시작 전/결말 화면의 공통 chrome — 골든타임 헤더 + 환자 카드.
 * 진행 중(IN_PROGRESS)엔 TransferRound가 이 chrome을 자체 소유(실시간 틱과 함께)하므로 여기선 쓰이지 않는다.
 */
function GameChrome({ game, children }: { game: GameState; children: ReactNode }) {
  const lowTime = game.timer.remainingSeconds <= LOW_TIME_THRESHOLD;
  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-1 flex-col gap-5 px-5 py-8 text-zinc-100 transition-shadow duration-500 bg-zinc-950">
      <EmergencyChrome
        patient={game.patient}
        remainingSeconds={game.timer.remainingSeconds}
        lowTime={lowTime}
      />
      {children}
    </main>
  );
}

export default function GameClient() {
  const [game, setGame] = useState<GameState>(newGame);
  const [started, setStarted] = useState(false);

  function handleRestart() {
    setGame(newGame());
    setStarted(false);
  }

  if (started && game.status === "IN_PROGRESS") {
    return <TransferRound game={game} onFinish={setGame} />;
  }

  if (!started) {
    return (
      <GameChrome game={game}>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setStarted(true)}
            className="rounded-lg bg-red-600 py-3 text-base font-semibold text-white transition-colors hover:bg-red-500"
          >
            전원 시작 — 받아줄 병원을 찾아라
          </button>
          <p className="text-xs leading-5 text-zinc-600">
            ※ 게임 속 180초는 실제 골든타임(급성심근경색 전원 시 첫 의료진 접촉 후 120분 이내
            재관류 권고)을 극적으로 압축한 연출입니다.
          </p>
        </div>
      </GameChrome>
    );
  }

  // 결말 — 차가운 사실 영수증(해석 없음)
  const debrief = buildDebrief(game);
  const ledger = buildLedger(game);
  const acceptedHospitalName = game.hospitals.find(
    (h) => h.id === game.acceptedHospitalId,
  )?.name;

  return (
    <GameChrome game={game}>
      <section className="flex flex-1 flex-col items-center gap-4 py-2 text-center">
        {game.status === "ACCEPTED" ? (
          <>
            <p className="text-2xl font-bold text-emerald-400">환자를 살렸습니다</p>
            <p className="text-sm text-zinc-400">
              {acceptedHospitalName}이(가) 전원을 수용했습니다.
            </p>
          </>
        ) : (
          <p className="text-2xl font-bold text-red-500">골든타임을 놓쳤습니다</p>
        )}

        <Receipt debrief={debrief} />
        {ledger && <LedgerPanel ledger={ledger} />}

        <button
          onClick={handleRestart}
          className="mt-2 rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium hover:bg-zinc-800"
        >
          다시 한 판
        </button>
        <p className="mt-4 max-w-md text-xs leading-5 text-zinc-600">
          등장하는 병원·인물·사건은 모두 허구이며, 특정 개인·집단을 비난하지 않습니다.
        </p>
      </section>
    </GameChrome>
  );
}
