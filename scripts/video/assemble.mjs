/**
 * 조립 — raw/*.log의 키 순간에서 in-점을 역산해 14토막을 자르고, 자막·BGM까지 붙인다.
 * 실행: 작업장(hs-video)에 복사해 `node assemble.mjs`. capture.mjs와 같은 ROOT를 쓴다.
 *
 * ⚠️ **이 파일이 저장소에 있는 이유**: v2(2026-08-03)까지 조립은 손으로 친 ffmpeg 명령 묶음이라
 * 어디에도 남지 않았다. 그래서 2026-08-05 재촬영 때 **완성본 mp4에서 14토막의 길이를 거꾸로 재는**
 * 일부터 해야 했다 — 재현 가능하다던 파이프라인의 절반이 사실 재현 불가였다. 컷 길이표는 자막
 * 타이밍(subs.ass)과 한 몸이라 특히 그렇다.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/kimsa/AppData/Local/Temp/hs-video";
const FF = path.join(ROOT, "node_modules/ffmpeg-static/ffmpeg.exe");
const SEG = path.join(ROOT, process.env.HS_SEG ?? "seg3");
/** 타이틀 카드 — 게임이 아니라 정적 HTML 한 장이라(title.mjs) 화면이 바뀌어도 다시 안 찍는다. */
const TITLE_PNG = process.env.HS_TITLE ?? path.join(ROOT, "raw-0803", "cut8.png");
/** 최종 파일 — 판올림할 때만 바꾼다(이전 판을 덮어쓰지 않는 것이 계약이다). */
const OUT_NAME = process.env.HS_OUT ?? "simspital-play-v3.mp4";
fs.mkdirSync(SEG, { recursive: true });
fs.mkdirSync(path.join(ROOT, "final"), { recursive: true });

/* ⚠️ **낡은 원본을 조용히 쓰지 않는다.** raw/에는 8/3판이 같은 이름으로 남아 있어, 한 컷을 아직
   안 찍었어도 조립이 통째로 성공한다 — 실제로 밟았다(cut6가 녹화 중인데 t11이 8/3 화면으로 붙었고
   에러가 하나도 없었다). 촬영일보다 오래된 webm이 섞이면 멈춘다. */
const FRESH_AFTER = Date.parse(process.env.HS_FRESH ?? "2026-08-05T00:00:00+09:00");
function assertFresh(cut) {
  const p = path.join(ROOT, "raw", `${cut}.webm`);
  const t = fs.statSync(p).mtimeMs;
  if (t < FRESH_AFTER) throw new Error(`raw/${cut}.webm이 낡았다(${new Date(t).toISOString()}) — 다시 찍어라`);
}

/** 로그에서 그 문구를 담은 첫 줄의 경과초. 로그 t0 = 녹화 시작이라 곧 영상 시각이다. */
function markAt(cut, needle) {
  const lines = fs.readFileSync(path.join(ROOT, "raw", `${cut}.log`), "utf8").split(/\r?\n/);
  const hit = lines.find((l) => l.includes(needle));
  if (!hit) throw new Error(`${cut}.log에 「${needle}」가 없다`);
  return Number(hit.split("\t")[0]);
}

/* 길이는 v2(59.4초)와 **한 토막씩 같게** 고정한다 — subs.ass의 타이밍이 그 길이표 위에 짜여
   있어서, 한 토막만 늘어도 뒤 자막이 통째로 밀린다. 바뀌는 것은 in-점뿐이다. */
const CUTS = [
  { src: "op", mark: "op1 서울 클릭", lead: -1.40, dur: 3.0, note: "지도 — 서울 클릭" },
  { src: "op", mark: "op2 [내과] 탭", lead: -0.15, dur: 3.1, note: "채용 — [내과] 탭·첫 채용" },
  { src: "op", mark: "op2 순환기내과 탭 정지", lead: -0.30, dur: 3.8, note: "채용 — 순환기 잔여 2명" },
  { src: "op", mark: "op2 간호사 1명 채용", lead: -0.60, dur: 2.5, note: "채용 — 간호사" },
  { src: "op", mark: "진료실 벽 미리보기", lead: -1.50, dur: 4.0, note: "건설 — 벽" },
  { src: "op", mark: "병동 침대 열 드래그 시작", lead: +1.70, dur: 2.0, note: "건설 — 병동 침대" },
  { src: "op", mark: "op4 시작", lead: +0.05, dur: 2.5, note: "개원 — 정문 줌인" },
  { src: "op", mark: "ov 실속도 3× 부감 시작", lead: +6.00, dur: 4.0, note: "부감 (경고칩 0개)" },
  // 여유가 0.6초뿐이다 — nb.webm이 123.4초인데 확대 응시가 그 끝까지 간다(lead를 줄이면 잘린다).
  { src: "nb", mark: "속보 카드 등장", lead: -2.40, dur: 8.0, note: "속보 + AI 서사 배지 확대" },
  { src: "ta", mark: "첫 응급 회차 발생", lead: -2.50, dur: 6.5, note: "첫 응급 회차" },
  { src: "cut6", mark: "12주 3일 속보", lead: -1.00, dur: 6.0, note: "의료소송 + 위축 고지" },
  { src: "cut7b_zoom", mark: "과별 표", lead: -0.50, dur: 4.5, note: "주간 결산 확대" },
  { src: "cut7cv2", mark: "폐업 결산 모달", lead: +1.50, dur: 4.0, note: "폐업 엔딩" },
  { title: true, dur: 5.5, note: "타이틀 카드" },
];

const V = ["-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-r", "30", "-an"];
/* 길이는 `-t`(초)가 아니라 **프레임 수**로 못박는다 — webm 원본의 프레임 타이밍이 30fps 격자에
   안 맞아 `-t 4.0`이 3.97초로 떨어졌고, 열네 토막이 조금씩 모자라 총 길이가 59.4→59.17로 밀렸다
   (자막 타이밍이 그 59.4 위에 짜여 있다). 프레임 수로 주면 격자에 정확히 얹힌다. */
const frames = (dur) => ["-frames:v", String(Math.round(dur * 30))];
const run = (args) => execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

const list = [];
CUTS.forEach((c, i) => {
  const out = path.join(SEG, `t${String(i + 1).padStart(2, "0")}.mp4`);
  if (c.title) {
    // 타이틀은 정지화상 — 페이드 인 0.5초(v1 절차 그대로).
    run(["-loop", "1", "-i", TITLE_PNG,
      "-vf", "fade=t=in:st=0:d=0.5,scale=1920:1080", ...frames(c.dur), ...V, out]);
    console.log(`t${i + 1} 타이틀 ${c.dur}s`);
  } else {
    assertFresh(c.src);
    const at = markAt(c.src, c.mark) + c.lead;
    /* 두 단 탐색 — `-ss`를 `-i` **앞**에 두면 키프레임까지 건너뛰어 빠르지만 그 단위로 튀고,
       뒤에만 두면 정확한 대신 앞부분을 통째로 디코딩한다(cut6는 30분짜리다). 앞에서 5초 전까지
       거칠게 뛰고 뒤에서 나머지 5초를 정확히 재생한다. */
    const coarse = Math.max(0, at - 5);
    run(["-ss", coarse.toFixed(2), "-i", path.join(ROOT, "raw", `${c.src}.webm`),
      "-ss", (at - coarse).toFixed(2), ...frames(c.dur), ...V, out]);
    console.log(`t${i + 1} ${c.src} @${at.toFixed(2)}s +${c.dur}s — ${c.note}`);
  }
  list.push(`file '${path.basename(out)}'`);
});

fs.writeFileSync(path.join(SEG, "list.txt"), list.join("\n") + "\n", "utf8");
run(["-f", "concat", "-safe", "0", "-i", path.join(SEG, "list.txt"), "-c", "copy", path.join(ROOT, "merged3.mp4")]);

/* 자막 번인 — Windows 경로는 콜론을 이스케이프해야 필터 파서가 안 삼킨다.
   원본은 저장소의 `scripts/video/subs.ass`이고, 작업장엔 판 번호를 붙여 복사해 둔다(v1의
   subs.ass가 같은 폴더에 남아 있어 덮으면 그 판을 다시 만들 수 없다). */
const subs = `${ROOT}/${process.env.HS_SUBS ?? "subs3.ass"}`.replace(/:/g, "\\:");
run(["-i", path.join(ROOT, "merged3.mp4"), "-vf", `subtitles='${subs}'`, ...V, path.join(ROOT, "merged3_sub.mp4")]);

// BGM — 총 길이에 맞춰 자르고 끝 3초 페이드 아웃.
const total = CUTS.reduce((s, c) => s + c.dur, 0);
run(["-i", path.join(ROOT, "merged3_sub.mp4"), "-i", path.join(ROOT, "bgm.m4a"),
  "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
  "-af", `afade=t=out:st=${(total - 3).toFixed(1)}:d=3`, "-t", String(total), "-shortest",
  path.join(ROOT, "final", OUT_NAME)]);

console.log(`\n완료 → final/${OUT_NAME} (${total.toFixed(1)}초)`);
