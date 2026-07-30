---
tags:
  - type/meta
name: warn-checklist-on-changelog
enabled: true
event: file
action: warn
path-pattern: changeLog\.md$
pattern: "##"
---
📋 changeLog를 갱신했다 — **구조적 문제 분류표도 확인하라** (사용자 지정 2026-07-30).

이번 작업이 `docs/concept/structural-problems-checklist.md`의 어느 항목(A1~D3)의
반영 상태(◎○△✕)를 바꿨으면 **해당 행과 집계 절을 함께 고친다.**
바꾼 항목이 없으면 넘어가도 된다 — 이 경고는 차단이 아니라 상기다.
