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
// ★v1.4.46★ 하루 채점 회계는 서버 권위(dailyLedger)로 옮겼다. 아래 §오늘 채점 횟수 참조.
import {
  gradedToday, addGradedToday, storageBroken, syncDailyLedger, setLedgerLearner, pendingDelta, GRADED_KEY,
} from './dailyLedger'

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
/** ★v1.4.43★ 상한을 다 쓴 뒤에도 **모험에서 새로 틀린 카드**는 오늘 만나야 한다 — 그 별도 몫.
 *  독립 감사가 잡은 회귀: 상한을 채운 오후에 모험에서 5문제를 틀리면, 그 5장이 오늘 안 나오고
 *  화면은 "내일 리젠돼"라고 말했다. 「틀린 건 그날 다시 만난다」는 약속이 또 조용히 깨진 것이다.
 *  그렇다고 무제한으로 두면 v1.4.40-b의 역인센티브가 돌아오므로 **하루 총량을 못 박는다.** */
export const DAILY_RESPAWN_EXTRA = 15
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

// ── 오늘 채점한 횟수 (★v1.4.43 — C6★) ────────────────────────
// reviewDone(위)은 '오늘 맞힌 카드'만 세서 재채굴을 막는다. 상한의 분모로 그것을 쓰면
// **오답은 상한을 소모하지 않아** 「헷갈려」를 누를수록 오늘 몫이 늘어난다 —
// 2026-08-17 실사용에서 「헷갈려」 23회가 오늘 몫을 60→106회로 늘렸다(정직 처벌, 헌법 §3-3 위반).
// 그래서 상한의 분모는 정오답 구분 없는 **채점 이벤트 수**로 따로 센다.
export const REVIEW_GRADED_KEY: string = GRADED_KEY

/* ★★v1.4.46 (L61 근본 해결) — 이 카운터는 이제 서버가 권위를 갖는다★★
   v1.4.43~45에서는 여기 localStorage 읽기·쓰기가 직접 있었다. 그런데 이 값이 **하루 상한의 분모**가
   되면서 위험 등급이 올라갔고, GPT 교차 감사가 7건을 지적했다(저장 실패 무음 → 상한 영구 리셋 /
   두 탭이면 상한 두 배 / 읽기-증가-저장 비원자 / 기기·날짜 변경으로 리셋).
   전부 "클라이언트가 규칙의 집행자가 된" 데서 온다.
   → 회계를 `lib/dailyLedger.ts`(서버 원자적 카운터 + 로컬 낙관 사본)로 옮겼다.
     여기서는 **이름만 다시 내보낸다** — 소비자(ReviewMine·todaysMine·검사)가 부르는 자리는 그대로다. */
export { gradedToday, addGradedToday, storageBroken, syncDailyLedger, setLedgerLearner, pendingDelta }

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
  /* ★v1.4.43 (C6) — 상한의 분모는 '오늘 채점 이벤트 수'다★
     v1.4.40-b는 오답 리스폰을 상한 **밖**에 두고 budget도 소모시키지 않았다.
     2026-08-17 실사용(세션 262): 상한 60인데 서로 다른 카드 83장·총 106회가 나갔고,
     초과분 23 = 「헷갈려」를 누른 횟수 23과 정확히 같았다. **정직하게 모른다고 할수록 오늘 할 일이 늘었다.**
     헌법 §3-3("오답 = 리스폰, 절대 처벌 아님") 정면 위반이라 설계를 바꾼다.
     이제 리스폰도 상한 **안**에 들어오되 **맨 앞자리**를 차지한다 —
     「틀린 건 오늘 꼭 다시 만나」는 지켜지고, 총량은 60을 넘지 않는다. */
  const graded = gradedToday()
  const budget = Math.max(0, cap - graded)
  const isRespawn = (c: T) => (c.box ?? 1) === 1 && c.last_result === false
  const sorted = minableCards(rows, today).slice().sort((a, b) =>
    (isRespawn(a) ? 0 : 1) - (isRespawn(b) ? 0 : 1)
    || (a.box ?? 1) - (b.box ?? 1)
    || String(a.due_date ?? '').localeCompare(String(b.due_date ?? ''))
    || (a.id ?? 0) - (b.id ?? 0))
  if (budget > 0) return sorted.slice(0, budget)
  /* ★상한 소진 뒤의 유일한 예외 — 오늘 틀린 카드★ (독립 감사 2026-08-17이 잡은 회귀 봉합)
     `slice(0, 0)`은 리스폰이든 뭐든 전부 잘라낸다. 그러면 오후 모험에서 틀린 카드를
     오늘 다시 만날 수 없고, 화면은 "내일 리젠돼"라는 **거짓말**을 한다.
     그래서 상한 밖 별도 몫을 두되, 그 몫도 하루 총량(cap + EXTRA)으로 못 박는다 —
     이미 쓴 초과분을 빼기 때문에 「헷갈려」를 눌러 되돌아와도 몫이 다시 늘지 않는다. */
  const extraLeft = Math.max(0, DAILY_RESPAWN_EXTRA - (graded - cap))
  return extraLeft > 0 ? sorted.filter(isRespawn).slice(0, extraLeft) : []
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
