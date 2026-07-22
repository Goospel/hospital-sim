#!/usr/bin/env node
// 제출용 PDF 빌드 — docs/submission/*.md → docs/submission/final/*.pdf
//
// 왜 이 파이프라인인가: 제출 문서는 마감까지 계속 바뀐다. PDF를 손으로 만들면 원본(md)과
// 곧 어긋나므로, **md가 단일 출처**이고 PDF는 매번 재생성물이 되게 한다. `npm run pdf` 한 번.
//
// md → HTML(marked) → Chrome headless --print-to-pdf. 외부 서비스·유료 도구 없이 로컬에서 끝난다.
// 한글은 시스템 폰트(맑은 고딕)로 렌더하므로 별도 폰트 임베드가 필요 없다.

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { marked } from 'marked'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DIR = join(ROOT, 'docs', 'submission')
const OUT_DIR = join(SRC_DIR, 'final')

/** 제출물 번호는 대회 요강 순서(③ 게임 소개 / ④ AI 활용)를 따른다. */
// title은 PDF 문서 속성(뷰어 탭에 뜨는 이름)이 된다 — 없으면 임시 html 파일명이 새어 나간다.
const DOCS = [
  { src: 'game-intro.md', out: '03-게임소개-수화기너머의벽.pdf', title: '수화기 너머의 벽 — 게임 소개 및 설명 (NAN 2026 사전과제)' },
  { src: 'ai-usage-doc.md', out: '04-AI활용기술문서-수화기너머의벽.pdf', title: '수화기 너머의 벽 — AI 활용 기술 문서 (NAN 2026 사전과제)' },
]

/** Chrome 실행 파일 — 환경변수 우선, 없으면 Windows/macOS 표준 경로. */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean)
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 지정하세요.')
  return found
}

/** frontmatter(옵시디언 type/* 태그)는 문서 본문이 아니라 메타라 PDF에서 제외한다. */
function stripFrontmatter(md) {
  return md.startsWith('---') ? md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '') : md
}

const CSS = `
@page { size: A4; margin: 17mm 15mm 18mm; }
* { box-sizing: border-box; }
body {
  font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
  font-size: 10pt; line-height: 1.7; color: #1a1a1a; margin: 0;
  -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 19pt; margin: 0 0 14px; padding-bottom: 8px; border-bottom: 2.5px solid #1a1a1a; letter-spacing: -0.4px; }
h2 { font-size: 14pt; margin: 26px 0 10px; padding-top: 10px; border-top: 1px solid #d5d5d5; letter-spacing: -0.3px; break-after: avoid; }
h3 { font-size: 11.5pt; margin: 18px 0 7px; color: #222; break-after: avoid; }
h4 { font-size: 10.5pt; margin: 14px 0 6px; }
p { margin: 8px 0; }
ul, ol { margin: 8px 0; padding-left: 20px; }
li { margin: 4px 0; }
a { color: #1a4b8c; text-decoration: none; }
strong { color: #000; }
code { background: #f0f2f4; padding: 1px 4px; border-radius: 3px; font-family: Consolas, 'D2Coding', monospace; font-size: 8.8pt; }
pre { background: #f6f8fa; border: 1px solid #e1e4e8; border-radius: 5px; padding: 10px 12px; overflow: hidden; break-inside: avoid; }
pre code { background: none; padding: 0; font-size: 8.2pt; line-height: 1.5; white-space: pre-wrap; word-break: break-all; }
blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid #9aa5b1; background: #f7f9fb; color: #333; break-inside: avoid; }
blockquote p { margin: 4px 0; }
table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 9pt; break-inside: avoid; }
th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #eef1f4; font-weight: 600; }
img { display: block; max-width: 100%; max-height: 215mm; margin: 12px auto; border: 1px solid #d0d0d0; border-radius: 4px; }
hr { border: none; border-top: 1px solid #ddd; margin: 22px 0; }
`

/**
 * 렌더 결과에 살아남은 `**`를 경고한다 — **강조가 파싱되지 않은 것**이다.
 *
 * 한국어 문서에서만 잘 터지는 함정: CommonMark는 닫는 `**` 앞이 문장부호이고 뒤가 글자면
 * right-flanking이 아니라고 보아 강조를 포기한다. `**「전원 불가」**이다` 처럼 괄호류로 감싼
 * 강조가 딱 그 모양이라, 원문에선 멀쩡해 보이는데 PDF에 별표가 그대로 찍힌다(무성 실패).
 * 고치는 법: 문장부호를 강조 밖으로 — `「**전원 불가**」이다`.
 */
function warnUnparsedEmphasis(src, html) {
  const stripped = html.replace(/<code[\s\S]*?<\/code>/g, '').replace(/<pre[\s\S]*?<\/pre>/g, '')
  const hits = stripped.split('\n').filter((l) => l.includes('**'))
  for (const line of hits) {
    const i = line.indexOf('**')
    const near = line.slice(Math.max(0, i - 40), i + 40).replace(/<[^>]+>/g, '')
    console.warn(`WARN  ${src}: 강조가 파싱되지 않았습니다(별표가 그대로 출력됨) — …${near}…`)
  }
}

function buildOne({ src, out, title }) {
  const srcPath = join(SRC_DIR, src)
  const md = stripFrontmatter(readFileSync(srcPath, 'utf8'))
  const body = marked.parse(md, { mangle: false, headerIds: false })
  warnUnparsedEmphasis(src, body)

  // 상대 이미지 경로를 file:// 절대경로로 — Chrome은 임시 html 위치를 기준으로 해석하기 때문.
  const withAbsImages = body.replace(/src="(?!https?:|file:)([^"]+)"/g, (_m, p) =>
    `src="${pathToFileURL(resolve(SRC_DIR, p)).href}"`,
  )

  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title><style>${CSS}</style></head><body>${withAbsImages}</body></html>`
  const tmp = join(OUT_DIR, `.tmp-${src}.html`)
  writeFileSync(tmp, html, 'utf8')

  execFileSync(findChrome(), [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    '--virtual-time-budget=8000',
    `--print-to-pdf=${join(OUT_DIR, out)}`,
    pathToFileURL(tmp).href,
  ], { stdio: 'pipe' })

  rmSync(tmp, { force: true })
  return out
}

mkdirSync(OUT_DIR, { recursive: true })
for (const doc of DOCS) {
  const out = buildOne(doc)
  const bytes = readFileSync(join(OUT_DIR, out)).length
  console.log(`PDF OK  ${out}  (${(bytes / 1024).toFixed(0)} KB)`)
}
console.log(`\n출력: ${OUT_DIR}`)
