/** 복습 광산 — 카드 조회 규칙과 '오늘 이미 캔 카드' 기록의 **단일 원천** (v1.4.29 신설)
 *
 * ★왜 이 파일이 생겼나 — 2026-08-14 P0 사고★
 * 같은 "오늘 캘 카드"를 두 곳이 서로 다르게 계산하고 있었다.
 *   · 하단 네비 뱃지(App.tsx)  = 서버에 "due인 카드만 세줘"          → 40
 *   · 복습 광산(ReviewMine)    = 카드 전체를 limit=500으로 받아 그 안에서 due 고르기 → 0
 * 예한이 카드가 685장이 되자 due 40장이 그 500장 창 **밖**으로 밀렸다. 뱃지엔 40이 떠 있는데
 * 광산은 "오늘 캘 카드가 없어"라고 말했고, 그날 모험에서 틀린 38문제를 다시 만날 수 없었다.
 * "틀린 문제는 반드시 복습으로 리스폰한다"는 이 앱의 약속이 조용히 깨져 있던 것이다.
 *
 * → 그래서 **조회 문자열과 판정 규칙을 여기 한 곳에만** 둔다. 소비자(앱 화면)는 쿼리를 직접 짜지 않는다.
 *   규칙이 복사되면 `review_check.mjs`가 실패한다(L27 — 검사는 기억이 아니라 스크립트로).
 */
import { todayStr } from './leitner'

/** 하루에 due가 될 수 있는 카드 수의 안전 상한.
 *  카드 총량(685장, 계속 증가)과 무관하게 **due는 수십 장 규모**라 여유가 크다.
 *  그래도 상한을 두는 이유: 상한이 없으면 서버 기본 상한(max-rows)에 조용히 잘린다. */
export const DUE_FETCH_LIMIT = 2000
/** 층별 보유량 집계용 상한 — box 한 컬럼만 받으므로 가볍다. */
export const BOX_FETCH_LIMIT = 20000

export const DUE_CARD_COLS = 'id,card_id,card_front,card_back,box,due_date,review_count'

/** 오늘 캘 수 있는 카드 조회 — ★서버에서 due를 거른다★(화면에서 거르지 않는다).
 *  order를 반드시 준다: 정렬 없는 limit은 "어떤 행이 올지 서버 마음"이라 오늘 사고의 절반이 이것이었다. */
export function dueCardsQuery(learnerId: string, today: string = todayStr()): string {
  return `learner_id=eq.${learnerId}&due_date=lte.${today}`
    + `&select=${DUE_CARD_COLS}&order=box.asc,id.asc&limit=${DUE_FETCH_LIMIT}`
}

/** 층별(박스별) 보유량 표시용 — box만 받는다. */
export function boxTotalsQuery(learnerId: string): string {
  return `learner_id=eq.${learnerId}&select=box&order=id.asc&limit=${BOX_FETCH_LIMIT}`
}

/** box 값을 1~5층으로 고정 (범위 밖 값이 들어와도 화면이 깨지지 않게) */
export function layerOf(box: number): number {
  return Math.min(Math.max(Number(box) || 1, 1), 5)
}

/** box 행 목록 → [_,1층,2층,3층,4층,5층] 보유량 */
export function tallyBoxes(rows: { box: number }[]): number[] {
  const acc = [0, 0, 0, 0, 0, 0]
  for (const r of rows) acc[layerOf(r.box)]++
  return acc
}

// ── 오늘 이미 캔 카드 (v1.4.4) ────────────────────────────────
// 서버 반영이 늦어도 같은 날 재채굴·XP 파밍을 막는 2중 안전망.
// 오답 카드는 기록하지 않는다 = 당일 리스폰(의도된 동작)을 보존한다.
export const REVIEW_DONE_KEY = 'wordcraft_review_done_v1'

export function getReviewDone(): Set<string> {
  try {
    const d = JSON.parse(localStorage.getItem(REVIEW_DONE_KEY) || 'null') as { date: string; ids: string[] } | null
    return d && d.date === todayStr() ? new Set(d.ids) : new Set<string>()
  } catch { return new Set<string>() }
}

export function addReviewDone(cardId: string): void {
  try {
    const cur = getReviewDone(); cur.add(cardId)
    localStorage.setItem(REVIEW_DONE_KEY, JSON.stringify({ date: todayStr(), ids: [...cur] }))
  } catch { /* 저장 실패해도 학습은 계속된다 */ }
}

/** 실제로 지금 캘 수 있는 카드 = 서버가 준 due 목록 − 오늘 이미 맞힌 카드.
 *  ★뱃지 숫자와 광산 숫자는 반드시 이 함수 하나를 통과한 결과여야 한다.★ */
export function minableCards<T extends { card_id: string; due_date?: string }>(
  rows: T[], today: string = todayStr(),
): T[] {
  const done = getReviewDone()
  return rows.filter(c => !done.has(c.card_id) && (c.due_date === undefined || c.due_date <= today))
}
