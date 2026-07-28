import type { Metadata } from "next";
import SessionClient from "@/components/SessionClient";

/**
 * `/classic` — 이전 판(콜 카드 루프). 랜딩이 타일 병원으로 바뀌면서 이리로 옮겨 왔다.
 *
 * 옮기기만 하고 본문은 **한 줄도 고치지 않는다**: 이 판은 제출 영상·문서가 이미 가리키는
 * 화면이라 손대면 그 기록들이 조용히 틀려진다. 임포트가 전부 `@/` 별칭이라 폴더가 한 단계
 * 깊어져도 경로가 그대로인 것도 여기 손댈 이유를 하나 줄여 준다.
 */
export const metadata: Metadata = {
  title: "수화기 너머의 벽 — 이전 판(콜 카드)",
  description:
    "걸려오는 응급 전원 요청을 15초 안에 받거나 돌려보내는 콜 카드 루프. 타일 병원 이전의 판으로, 그대로 남겨 둔다.",
};

export default function ClassicPage() {
  return <SessionClient />;
}
