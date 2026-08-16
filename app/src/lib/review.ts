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

export const DUE_CARD_COLS = 'id,card_id,card_front,card_back,box,due_date,review_count,last_result'

/* ═══════════════════════════════════════════════════════════════════════
   ★★v1.4.40 — 하루 상한. "다 하기"가 아니라 "오늘 몫을 끝내기"★★

   2026-08-16 독립 교차 검증에서 실측된 것:
     · 복습 2,026문항의 정답률 99.85%, **응답시간 중앙값 246ms**, 91%가 1초 미만.
     · 세션 #246은 서로 다른 카드 **376장을 157초에 전부 정답 처리**했다(장당 0.42초).
     · 그 결과 카드 687장 중 401장(58%)이 박스4~5(7일·14일 주기)로 올라가 있다.
       **인출 없이 올라간 카드는 잊힌다 — 간격 반복이 무력화된 상태였다.**

   왜 그랬나: 광산 입구가 "오늘 캘 카드 116장 · 오늘 최대 +1380 XP · 채굴 시작!(116장)"이라고
   적혀 있었다. 정직하게 풀면 12~15분인데 예한이의 한 세션 집중은 15~20분이다.
   **XP를 최대화하는 가장 합리적인 전략이 "읽지 않고 연타"였다.** 아이 탓이 아니라 설계 탓이다.

   → 그래서 오늘 캘 수 있는 양 자체에 상한을 둔다. 상한까지가 "오늘 몫"이고, 그걸 끝내면 완주다.
     남은 카드는 사라지지 않고 내일 다시 온다(due_date는 그대로 ≤ 오늘).
   ═══════════════════════════════════════════════════════════════════════ */
/** 하루에 캘 수 있는 카드 상한 (Dio님 결정 2026-08-16). 60장 ≈ 정직한 속도로 7~8분. */
export const DAILY_MINE_CAP = 60
/** 카드를 뒤집은 뒤 채점 버튼이 열리기까지의 최소 시간(ms). 뒷면을 볼 시간도 없는 채점을 막는다. */
export const MIN_REVEAL_MS = 900

/** 오늘 캘 수 있는 카드 조회 — ★서버에서 due를 거른다★(화면에서 거르지 않는다).
 *  order를 반드시 준다: 정렬 없는 limit은 "어떤 행이 올지 서버 마음"이라 오늘 사고의 절반이 이것이었다.
 *  v1.4.40: 정렬에 due_date를 넣어 **가장 오래 밀린 것부터** 캔다(상한이 생겼으므로 우선순위가 생겼다).
 *  id.asc 타이브레이크는 페이지 경계 안정성을 위해 유지한다(L31). */
export function dueCardsQuery(learnerId: string, today: string = todayStr()): string {
  return `learner_id=eq.${learnerId}&due_date=lte.${today}`
    + `&select=${DUE_CARD_COLS}&order=box.asc,due_date.asc,id.asc&limit=${DUE_FETCH_LIMIT}`
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

/** ★v1.4.40 — 오늘의 몫★ = minableCards 중 **우선순위 상위 DAILY_MINE_CAP장**.
 *
 *  ★하단 네비 뱃지와 광산 버튼은 반드시 이 함수 하나를 통과한 결과여야 한다.★
 *  (2026-08-14 사고: 뱃지는 서버 due를 세고 광산은 500장 창에서 골라 40 vs 0으로 갈렸다.
 *   상한을 한쪽에만 넣으면 그 사고가 그대로 재현된다 — 그래서 규칙을 여기 한 곳에 둔다.)
 *
 *  우선순위: 서버 정렬(box asc → due_date asc)을 그대로 신뢰한다.
 *  = ① 틀려서 리스폰된 카드(박스1) ② 그중 가장 오래 밀린 것 순.
 *  방어적으로 화면에서도 한 번 더 정렬한다(정렬 없는 응답이 와도 순서가 흔들리지 않게). */
export function todaysMine<T extends { card_id: string; due_date?: string; box?: number; id?: number; last_result?: boolean | null }>(
  rows: T[], today: string = todayStr(), cap: number = DAILY_MINE_CAP,
): T[] {
  // ★상한은 "한 번에 몇 장"이 아니라 "오늘 하루에 몇 장"이다★
  //   이미 캔 만큼을 빼지 않으면, 60장을 끝내고 입구로 돌아왔을 때 남은 카드가 다시 오늘 몫이 되어
  //   상한이 아무 일도 하지 않는다.
  const budget = Math.max(0, cap - getReviewDone().size)
  const sorted = minableCards(rows, today).slice().sort((a, b) =>
    (a.box ?? 1) - (b.box ?? 1)
    || String(a.due_date ?? '').localeCompare(String(b.due_date ?? ''))
    || (a.id ?? 0) - (b.id ?? 0))
  /* ★v1.4.40-b — 리스폰 카드는 상한을 넘는다★
     독립 감사 지적: 상한이 소진되면 **방금 모험에서 틀린 카드조차 오늘 만날 수 없었다.**
     "틀린 모든 문제는 그날 복습으로 리스폰한다"는 이 앱의 약속이 상한 도입으로 조용히 깨졌다.
     구분 기준: 박스1 + `last_result === false` = 실제로 틀려서 내려온 카드(새로 시드된 카드는 last_result가 null).
     상한의 목적은 '연타로 XP 파밍'을 막는 것이지 '틀린 문제를 숨기는 것'이 아니다. */
  const isRespawn = (c: T) => (c.box ?? 1) === 1 && c.last_result === false
  const respawn = sorted.filter(isRespawn)
  const rest = sorted.filter(c => !isRespawn(c)).slice(0, budget)
  const seen = new Set(respawn.map(c => c.card_id))
  return [...respawn, ...rest.filter(c => !seen.has(c.card_id))]
}

/** 오늘 이미 캔(맞힌) 카드 수 — 상한 소진량. 화면 문구·검사에서 함께 쓴다. */
export function minedToday(): number { return getReviewDone().size }

/** ★v1.4.40★ '알아!'와 '헷갈려'의 좌우를 카드마다 뒤집을지.
 *
 *  왜 화면이 아니라 여기 있나: 첫 구현은 `((i * 2654435761) ^ seed) % 2 === 1` 이었는데
 *  곱셈 결과가 int32를 넘어가 XOR이 **음수**가 되고, 음수의 `% 2`는 JS에서 0 또는 -1이라
 *  `=== 1`이 영원히 거짓이었다 — **버튼이 한 번도 안 섞였다.**
 *  화면 안에 있었으면 스크린샷으로만 확인했을 것이고, 5장을 눌러 보기 전까지 몰랐을 것이다.
 *  그래서 규칙을 여기 두고 검사로 봉인한다(L27 — 검사는 기억이 아니라 스크립트로).
 *
 *  ★두 번 틀렸던 자리★ 두 번째 시도는 `& 1`이었는데, 이 해시들의 최하위 비트는 입력의 최하위 비트에
 *  그대로 끌려간다 → i가 1씩 늘면 좌·우·좌·우로 **정확히 교대**했다(실측: 헷,알,헷,알,헷).
 *  그래서 murmur3 fmix32로 32비트를 섞고 **최상위 비트**를 쓴다. 최상위 비트는 입력 전체에 의존한다.
 *  실측(seed 400개 × 60장 = 24,000표본): 좌우 비율 50.5% · 연속 교대 49.8% · 최장 동일 연속 18장. */
export function gradeSwapped(i: number, seed: number): boolean {
  let n = (i + Math.imul(seed, 0x9e3779b1)) | 0
  n ^= n >>> 16
  n = Math.imul(n, 0x85ebca6b)
  n ^= n >>> 13
  n = Math.imul(n, 0xc2b2ae35)
  n ^= n >>> 16
  return (n >>> 31) === 1
}
