/** 관제실 지표 진실 엔진 — v1.4.35 신설 (아빠 화면에 뜨는 모든 숫자의 단일 원천)
 *
 * ★왜 이 파일이 생겼나 — 2026-08-15 적대적 검증에서 드러난 것★
 *
 *  ① **오늘 학습 시간이 거짓이었다.** 8/15 예한이가 푼 문항은 0개인데 `sessions.duration_seconds`
 *     합계는 42,216초(11시간 43분)였고, 관제실은 "⏱ 오늘 학습 703분 · 목표 15분 달성 ✓"이라고 적었다.
 *     원인은 두 겹이다.
 *       · 학습자 앱이 **입력이 없어도** 화면만 켜져 있으면 30초마다 시간을 쌓았다(store.tickSession).
 *       · 탭을 두 개 열면 나중 탭이 localStorage의 sessionId를 덮어써, **한 세션에 다른 탭의 누적치**가
 *         기록됐다 — 실제로 세션 #242는 실경과 69초인데 1,150초로 저장돼 있다(duration > 벽시계).
 *     그리고 관제실은 `Math.max(세션시간, 활동시간)`으로 **더 큰 쪽**, 즉 오염된 값을 골라 왔다.
 *
 *  ② **정답률이 복습으로 부풀려져 있었다.** 전체 4,056문항 중 복습이 1,650(41%)이고 그 정답률이 99.8%다.
 *     같은 날 신규 학습 정답률은 61~87%였는데, 헤드라인 "오늘 정답률"은 둘을 섞어 90%를 보여준다.
 *     아빠가 보는 숫자가 **실력이 아니라 그날의 복습 비중**을 재고 있었다는 뜻이다.
 *     자기 채점인 `speak`(40/40)와 채점이 아닌 `forge_discover`(83/83)도 분모에 그대로 들어 있었다.
 *
 * ★그래서 이 파일의 규칙은 하나다 — **증거 없는 숫자는 만들지 않는다.**★
 *   · 문항 기록이 없는 시간은 학습 시간이 아니다. 켜 둔 시간은 '켜 둔 시간'으로만 부른다.
 *   · 세션 duration은 자기 세션의 벽시계(started_at→ended_at)를 넘을 수 없다.
 *   · 채점이 아닌 것(진단·발견)과 자기 채점(말하기)은 정답률 분모에서 뺀다.
 *   · 신규 학습과 복습은 절대 한 숫자로 합치지 않는다.
 *
 * 소비자(AdminPage·AdminHealth)는 여기 있는 함수만 부른다. 규칙을 화면 파일에 복사하면
 * `admin_check.mjs`가 실패한다(L27 — 검사는 기억이 아니라 스크립트로).
 */
import { MODULE_ORDER, EXT_MODULE_ORDER } from './content'
import { answerXpOf, moduleBonusOf, XP } from './xp'
// v1.4.40-b — 복습 '너무 빠름' 임계값은 아이 화면의 읽기 게이트에 연동돼야 한다(고정값이면 게이트가 올라갈 때 죽는다).
import { MIN_REVEAL_MS } from './review'

/* ═════════ 입력 타입 (관제실이 서버에서 받은 행의 최소 형태) ═════════ */
export interface MetricEvent {
  activity_type: string
  is_correct: boolean
  created_at: string
  module_id: string
  response_ms: number | null
  /** v1.4.40 — 어느 세션(=어느 기기)에서 나온 문항인지. device 혼입을 걸러내려면 이것이 필요하다.
   *  `answer_events`에는 device 컬럼이 없어서 session_id로 sessions에 이어 붙이는 수밖에 없다. */
  session_id?: number | null
}
export interface MetricSession {
  id: number
  started_at: string
  ended_at: string | null
  duration_seconds: number | null
  device: string | null
}
export interface MetricProgress {
  module_id: string
  status: string
  best_score: number | null
  completed_at: string | null
  updated_at: string
  mastered_at?: string | null
}
export interface MetricCard {
  card_id: string
  box: number
  due_date: string | null
}

/* ═════════ 상수 — 왜 이 값인지까지 남긴다 ═════════ */
/** 문항과 문항 사이가 이보다 벌어지면 '공부한 시간'으로 세지 않는다(딴짓·자리 비움). */
export const ACTIVE_GAP_SEC = 300
/** 한 세션이 이보다 길면 사람이 앉아 있던 시간이 아니다 — 켜 둔 것이다. 3시간에서 자른다. */
export const SESSION_MAX_SEC = 3 * 3600
/** 첫 문항 앞·마지막 문항 뒤에 얹어 주는 여유(읽는 시간·화면 이동). 문항이 있을 때만 준다. */
export const EDGE_GRACE_SEC = 90
/** 출석 인정 기준 (CONTRACT §5 — 학습자 앱과 같은 값) */
export const GOAL_SEC = 15 * 60
/** '켜 둔 시간'이 '공부한 시간'보다 이 배수 이상이면 방치로 본다 → 정합성 진단이 경고한다. */
export const IDLE_SUSPECT_RATIO = 3
/** 그 판정을 하기 위한 최소 격차(초). 짧은 세션에서 배수만으로 오탐하지 않게. */
export const IDLE_SUSPECT_MIN_GAP = 20 * 60

/** 채점이 아닌 활동 — 정답률 분모에서 뺀다.
 *  diagnostic = 배치 진단(맞고 틀림이 실력 신호가 아니다), forge_discover = 문장 '발견' 기록(항상 정답). */
export const NON_ASSESSED_TYPES = new Set(['diagnostic', 'forge_discover'])
/** 자기 채점 — 아이가 스스로 "말했다"를 누르면 무조건 정답이 된다. 실력 지표가 아니다. */
export const SELF_GRADED_TYPES = new Set(['speak'])
/** 복습(간격 반복) — 이미 아는 것을 다시 만나는 것이라 정답률이 구조적으로 높다. 따로 센다. */
export const REVIEW_TYPES = new Set(['review'])

/* ═════════ ⓪ 기기 분리 — 아빠 PC 기록은 아이 지표가 아니다 (v1.4.40) ═════════
 *
 * ★2026-08-16 독립 교차 검증 실측★
 *   · 기록된 세션 시간의 **89.2%가 desktop**이다(desktop 70.0시간 vs mobile 8.4시간).
 *   · 문항도 **85건이 desktop 세션**에서 나왔다(아빠가 확인하려고 풀어 본 것).
 *   · 그런데 `device`는 소스 전체에서 **필터로 한 번도 쓰이지 않았다** — 표시와 경고문에만 쓰였다.
 *     v1.4.37이 "PC에서 연 기록이 섞여 있어요"라고 **말은 했지만 빼지는 않았다.**
 *
 * ★그리고 이 규칙이 여기 있는 이유★ — 같은 판정을 학습자 앱(store.syncSharedDaily)과
 *   관제실(AdminPage)이 **각자 계산하다가** 갈라졌다(L46). 이제 둘 다 아래 함수만 부른다.
 *   화면이나 store에 규칙을 복사하면 `admin_check.mjs`가 실패한다(L27).
 */
/** 아이 지표에서 제외할 기기. 'desktop' = 아빠 PC. */
export const NON_LEARNER_DEVICES = ['desktop']

/** 제외 대상 세션 id 집합. */
export function excludedSessionIds(
  sessions: MetricSession[], exclude: readonly string[] = NON_LEARNER_DEVICES,
): Set<number> {
  const out = new Set<number>()
  for (const s of sessions) if (s.device && exclude.includes(s.device)) out.add(s.id)
  return out
}

/** 아이 기기 세션만. */
export function learnerSessions(
  sessions: MetricSession[], exclude: readonly string[] = NON_LEARNER_DEVICES,
): MetricSession[] {
  return sessions.filter(s => !s.device || !exclude.includes(s.device))
}

/** 아이 기기에서 나온 문항만.
 *  `session_id`가 없는 옛 기록(오프라인 등)은 **버리지 않는다** — 지우는 쪽이 아니라 남기는 쪽이 안전하다.
 *  (기록을 과소 집계하는 것도 결함이다. 판단이 안 서면 아이에게 유리한 쪽으로 남긴다.) */
export function learnerEvents<T extends { session_id?: number | null }>(
  events: T[], excluded: Set<number>,
): T[] {
  if (!excluded.size) return events
  return events.filter(e => e.session_id == null || !excluded.has(e.session_id))
}

/* ═════════ 날짜 ═════════ */
/** KST 오프셋(분). 한국은 1988년 이후 서머타임이 없어 **항상 UTC+9**다 — 그래서 고정 오프셋 산술이 안전하다. */
const KST_OFFSET_MS = 9 * 3600_000

/**
 * ISO 문자열 → KST 'YYYY-MM-DD'.
 *
 * ★왜 `toLocaleDateString('sv', { timeZone })`를 쓰지 않는가 (v1.4.39, 실측으로 배운 것)★
 *   v1.4.38에서 조회 절단을 고치자 문항이 1,000건 → 4,432건으로 늘었다. 그 순간 관제실이 멈췄다.
 *   집계가 날짜별로 여러 번 훑기 때문에 이 함수가 한 번 그릴 때 **40만 번 넘게** 불린다.
 *   `Intl` 경유 변환은 호출당 수십 마이크로초라, 40만 번이면 10초가 넘는 메인 스레드 정지가 된다.
 *   같은 결과를 내는 고정 오프셋 산술은 수백 나노초다 — **결과는 같고 속도만 100배 빠르다.**
 *   (교훈: 상한을 풀면 그 뒤의 계산량도 같이 검토해야 한다. 고친 것이 새 결함을 낳는다 — L44.)
 */
export function kstDayOf(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return new Date(iso).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  return new Date(t + KST_OFFSET_MS).toISOString().slice(0, 10)
}
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

/* ═════════ ① 학습 시간 — 켜 둔 시간과 공부한 시간을 나눈다 ═════════ */

/** 한 세션이 주장하는 시간을 **믿을 수 있는 값으로 깎는다.**
 *  duration_seconds는 클라이언트가 쓴 숫자라 자기 세션의 벽시계를 넘을 수 있다(실제로 넘었다).
 *  ended_at이 없으면(비정상 종료) 지금까지를 벽시계로 본다. */
export function credibleSessionSec(s: MetricSession, now: number = Date.now()): number {
  const raw = Math.max(0, Math.round(s.duration_seconds || 0))
  const start = Date.parse(s.started_at)
  if (!Number.isFinite(start)) return Math.min(raw, SESSION_MAX_SEC)
  const end = s.ended_at ? Date.parse(s.ended_at) : now
  const wall = Number.isFinite(end) ? Math.max(0, Math.round((end - start) / 1000)) : raw
  return Math.min(raw, wall, SESSION_MAX_SEC)
}

/** 세션이 자기 벽시계보다 긴 시간을 주장하는가 = 기록 파손(다중 탭 덮어쓰기 등). */
export function isSessionCorrupt(s: MetricSession, now: number = Date.now()): boolean {
  const raw = Math.round(s.duration_seconds || 0)
  const start = Date.parse(s.started_at)
  const end = s.ended_at ? Date.parse(s.ended_at) : now
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false
  const wall = Math.max(0, Math.round((end - start) / 1000))
  return raw > wall + 30 // 30초는 하트비트 타이밍 오차 여유
}

/** 정렬된 문항 시각(ms) 목록 → '실제로 손이 움직인 시간'(초). 5분 이상 벌어진 구간은 버린다.
 *  ★산식은 여기 한 곳에만 있다★ — focusSecOfDay와 attendanceDays가 둘 다 이걸 부른다.
 *  같은 규칙을 두 번 적으면 반드시 갈라진다(L46). */
export function focusSecOfTimestamps(sortedTs: number[]): number {
  if (sortedTs.length === 0) return 0
  let sec = 0
  for (let i = 1; i < sortedTs.length; i++) {
    const g = (sortedTs[i] - sortedTs[i - 1]) / 1000
    if (g > 0 && g < ACTIVE_GAP_SEC) sec += g
  }
  return Math.round(sec + EDGE_GRACE_SEC)
}

/** 문항 타임스탬프에서 '실제로 손이 움직인 시간'을 낸다. 5분 이상 벌어진 구간은 버린다. */
export function focusSecOfDay(events: MetricEvent[], dayKey: string): number {
  const ts = events
    .filter(e => kstDayOf(e.created_at) === dayKey)
    .map(e => Date.parse(e.created_at))
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b)
  return focusSecOfTimestamps(ts)
}

export interface StudyTime {
  /** 아빠 화면에 '오늘 학습'으로 뜨는 값 = 실제로 문제를 푼 시간(초) */
  focusSec: number
  /** 앱이 열려 있던 시간(초). 신뢰 보정을 거친 세션 합. */
  openSec: number
  /** 세션 원본이 주장한 시간(초) — 얼마나 부풀려져 있었는지 보여 주기 위해 남긴다. */
  rawSessionSec: number
  /** 문항 수 (0이면 학습 시간은 무조건 0) */
  answers: number
  /** 켜 두기만 한 정황 */
  idleSuspect: boolean
  /** 벽시계를 넘긴 세션 수 = 기록 파손 */
  corruptSessions: number
  /** 이 날 기록에 섞인 기기 종류 */
  devices: string[]
}

/** 하루치 학습 시간. **문항이 하나도 없으면 focusSec는 0이다** — 증거 없는 시간은 학습이 아니다. */
export function studyTimeOfDay(
  events: MetricEvent[], sessions: MetricSession[], dayKey: string, now: number = Date.now(),
): StudyTime {
  const dayEvents = events.filter(e => kstDayOf(e.created_at) === dayKey)
  const daySessions = sessions.filter(s => kstDayOf(s.started_at) === dayKey)
  const focusSec = dayEvents.length ? focusSecOfDay(events, dayKey) : 0
  const openSec = daySessions.reduce((a, s) => a + credibleSessionSec(s, now), 0)
  const rawSessionSec = daySessions.reduce((a, s) => a + Math.max(0, Math.round(s.duration_seconds || 0)), 0)
  const gap = openSec - focusSec
  return {
    focusSec,
    openSec,
    rawSessionSec,
    answers: dayEvents.length,
    idleSuspect: gap >= IDLE_SUSPECT_MIN_GAP && openSec >= focusSec * IDLE_SUSPECT_RATIO,
    corruptSessions: daySessions.filter(s => isSessionCorrupt(s, now)).length,
    devices: Array.from(new Set(daySessions.map(s => s.device || '알 수 없음'))).sort(),
  }
}

/* ═════════ ①-2 출석 판정 — 아이 앱과 관제실이 **같은 함수**를 쓴다 (v1.4.40) ═════════
 *
 * ★왜 이게 여기로 옮겨 왔나 (2026-08-16 독립 교차 검증)★
 *   v1.4.35는 관제실의 학습 시간을 "증거 없는 시간은 0"으로 고쳤지만, **출석은 안 고쳤다.**
 *   학습자 앱 `store.syncSharedDaily`가 서버 `sessions.duration_seconds` **원본 합**을 날짜별로 더해
 *   900초를 넘으면 출석일로 삼고 있었고, `Math.max(로컬, 서버 원본 합)`으로 오늘 활성시간까지 덮어썼다.
 *   실측: **2026-07-24는 푼 문항이 0개인데 출석일**이었다(원본 합 5,771초, 그중 desktop 5,648초).
 *   그 위에 `repairStreak`이 연속 구간을 세어 서버 `learners.streak_days`에 썼고,
 *   `streak_3/7/14/30` 뱃지가 그 값으로 판정됐다 — **거짓 시간 → 거짓 출석 → 거짓 뱃지.**
 *
 * ★규칙 (Dio님 결정 2026-08-16)★ 하루 출석 = 아래 셋을 **전부** 만족.
 *   ① 그날 문항 기록이 있다 (증거 없는 시간은 학습이 아니다 — L45)
 *   ② 그 문항이 **아이 기기**에서 나왔다 (desktop = 아빠 PC는 뺀다)
 *   ③ 문항 간격으로 계산한 집중 시간이 15분 이상 (기존 약속 유지)
 *   → `sessions.duration_seconds`는 **출석 판정에 일절 쓰지 않는다.** 그 값은 '켜 둔 시간'일 뿐이다.
 */
export const ATTENDANCE_RULE = { needAnswers: 1, needFocusSec: GOAL_SEC } as const

/** 문항 기록으로 출석일을 전부 뽑는다(KST). 반환은 오름차순 날짜키. */
export function attendanceDays(events: MetricEvent[], sessions: MetricSession[]): string[] {
  const excluded = excludedSessionIds(sessions)
  const byDay = new Map<string, number[]>()
  for (const e of learnerEvents(events, excluded)) {
    const t = Date.parse(e.created_at)
    if (!Number.isFinite(t)) continue
    const k = kstDayOf(e.created_at)
    const arr = byDay.get(k)
    if (arr) arr.push(t); else byDay.set(k, [t])
  }
  const out: string[] = []
  for (const [k, ts] of byDay) {
    if (ts.length < ATTENDANCE_RULE.needAnswers) continue
    ts.sort((a, b) => a - b)
    if (focusSecOfTimestamps(ts) >= ATTENDANCE_RULE.needFocusSec) out.push(k)
  }
  return out.sort()
}

/** 출석일 목록 → 오늘(또는 어제)까지 이어지는 연속 일수.
 *  오늘 아직 안 했으면 **어제까지의 연속**을 그대로 살려 준다(하루가 끝나기 전에 불꽃을 끄지 않는다). */
export function streakFrom(days: string[], todayKey: string): number {
  const set = new Set(days)
  let cursor = set.has(todayKey) ? todayKey : addDays(todayKey, -1)
  if (!set.has(cursor)) return 0
  let run = 0
  while (set.has(cursor)) { run++; cursor = addDays(cursor, -1) }
  return run
}

/* ═════════ ② 정답률 — 신규와 복습을 절대 섞지 않는다 ═════════ */
export interface AccuracySplit {
  /** 신규 학습(모험) — 실력 신호 */
  newTotal: number; newCorrect: number; newPct: number | null
  /** 복습 — 파지 신호 */
  reviewTotal: number; reviewCorrect: number; reviewPct: number | null
  /** 분모에서 뺀 것들 (진단·발견·자기채점) */
  excluded: number
  /** 참고용 — 예전 관제실이 보여 주던 '섞인' 정답률. 얼마나 부풀었는지 대조용으로만 쓴다. */
  blendedPct: number | null
  /** v1.4.40 — 복습 중 **뒷면을 읽었다고 보기 어려운 속도**로 넘긴 비율(%) */
  reviewFast: number
  reviewFastPct: number | null
}

/** 복습 한 장을 이보다 빨리 넘겼다면 뒷면을 읽고 낸 답이 아니다.
 *  2026-08-16 실측: 복습 2,026장의 **중앙값이 246ms**, 91%가 1초 미만이었다.
 *  같은 아이의 신규 학습 문항 중앙값은 1~7초다 — 복습만 한 자릿수 배로 빨랐다.
 *
 *  ★★v1.4.40-b — 고정값 1000ms는 **자기 게이트 때문에 즉사할 뻔했다**★★
 *  같은 릴리스가 `MIN_REVEAL_MS`(뒷면 읽는 시간 900ms) 게이트를 넣었다. `response_ms`는
 *  '직전 카드를 채점한 순간부터'라서 앞으로 모든 복습의 하한이 900ms를 넘는다 — 임계값이 1,000ms면
 *  신규 데이터에서 **아무도 안 걸린다.** 죽은 신호(`sessions_truncated`)를 고쳐 놓고 같은 릴리스에서
 *  죽은 신호를 하나 만들 뻔했다(독립 감사 지적). 그래서 게이트에 **연동**한다.
 *  실측 연타 하한이 1,177ms이므로 900+400=1,300ms면 그 행동을 잡는다. */
export const FAST_REVIEW_MS = MIN_REVEAL_MS + 400
/** 복습의 이 비율 이상이 FAST_REVIEW_MS 미만이면 '읽지 않고 넘긴 것'으로 보고 경고한다. */
export const FAST_REVIEW_SUSPECT_PCT = 50
/** 그 판정을 하기 위한 최소 표본 (몇 장 안 되는 날에 오탐하지 않게) */
export const FAST_REVIEW_MIN_N = 20

export function isAssessed(e: MetricEvent): boolean {
  return !NON_ASSESSED_TYPES.has(e.activity_type) && !SELF_GRADED_TYPES.has(e.activity_type)
}

/** ★v1.4.40★ **신규 학습**(=실력 신호)인 문항인가. 채점 대상이면서 복습이 아닌 것.
 *
 *  왜 새로 필요했나: `isAssessed`는 복습을 **통과시킨다**. 그래서 취약 영역·모듈 마스터리·
 *  일별 정답률이 전부 복습으로 희석돼 있었다. 2026-08-16 실측:
 *    · R0(동굴 발견)  화면 70% ↔ 신규 학습만 **39%** (복습 140건이 섞임)
 *    · R9(소리를 여는 자) 화면 76% ↔ 신규 학습만 **44%** (복습 54건)
 *  결과가 단순한 오차가 아니라 **순위가 뒤바뀌었다** — 가장 많이 복습한 = 가장 많이 틀렸던 단원이
 *  오히려 안전해 보였고, "가장 약한 곳"이 엉뚱한 단원을 가리켰다. 그 문장이 그대로 처방으로 나갔다. */
export function isNewLearning(e: MetricEvent): boolean {
  return isAssessed(e) && !REVIEW_TYPES.has(e.activity_type)
}

export function accuracyOf(events: MetricEvent[]): AccuracySplit {
  let nT = 0, nC = 0, rT = 0, rC = 0, ex = 0, bT = 0, bC = 0, rFast = 0
  for (const e of events) {
    bT++; if (e.is_correct) bC++
    if (!isAssessed(e)) { ex++; continue }
    if (REVIEW_TYPES.has(e.activity_type)) {
      rT++; if (e.is_correct) rC++
      if (e.response_ms != null && e.response_ms < FAST_REVIEW_MS) rFast++
    } else { nT++; if (e.is_correct) nC++ }
  }
  const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : null)
  return {
    newTotal: nT, newCorrect: nC, newPct: pct(nC, nT),
    reviewTotal: rT, reviewCorrect: rC, reviewPct: pct(rC, rT),
    excluded: ex, blendedPct: pct(bC, bT),
    reviewFast: rFast, reviewFastPct: pct(rFast, rT),
  }
}

/* ═════════ ③ 진도 — 분모는 아이 화면과 같아야 한다 ═════════ */
export interface ProgressView {
  /** 아이 화면에 보이는 전체 모듈 수 (worlds_ready에 따라 28 또는 52) */
  total: number
  done: number
  pct: number
  /** 기준선(월드 1~5) */
  baseDone: number; baseTotal: number
  /** 확장(월드 7~10) */
  extDone: number; extTotal: number
  /** 아이 화면에 확장 월드가 열려 있는가 */
  extOpen: boolean
}
const isDoneStatus = (st?: string | null) => st === 'completed' || st === 'mastered'

export function progressView(progress: MetricProgress[], worldsReady: boolean): ProgressView {
  const doneSet = new Set(progress.filter(p => isDoneStatus(p.status)).map(p => p.module_id))
  const baseDone = MODULE_ORDER.filter(id => doneSet.has(id)).length
  const extDone = EXT_MODULE_ORDER.filter(id => doneSet.has(id)).length
  const total = worldsReady ? MODULE_ORDER.length + EXT_MODULE_ORDER.length : MODULE_ORDER.length
  const done = worldsReady ? baseDone + extDone : baseDone
  return {
    total, done, pct: total ? Math.round((done / total) * 100) : 0,
    baseDone, baseTotal: MODULE_ORDER.length,
    extDone, extTotal: EXT_MODULE_ORDER.length,
    extOpen: worldsReady,
  }
}

/* ═════════ ④ 복습 부채 — 숫자만 던지지 않고 '며칠이면 갚는지'까지 ═════════ */
export interface ReviewDebt {
  due: number; overdue: number; today: number
  /** 가장 오래 밀린 카드가 며칠 지났는가 */
  oldestOverdueDays: number
  /** 최근 학습일 기준 하루 평균 복습 처리량 */
  pacePerDay: number
  /** 이 페이스로 밀린 것을 다 갚는 데 걸리는 날. 페이스가 없으면 null */
  daysToClear: number | null
  /** 하루 15분 안에 감당 가능한 규모인가 */
  overCapacity: boolean
}
/** 15~20분 세션에서 복습으로 감당 가능한 현실적 카드 수 (실측 응답시간 기준 상한) */
export const DAILY_REVIEW_CAPACITY = 60

export function reviewDebtOf(cards: MetricCard[], events: MetricEvent[], todayKey: string): ReviewDebt {
  const dued = cards.filter(c => c.due_date && c.due_date <= todayKey)
  const overdue = cards.filter(c => c.due_date && c.due_date < todayKey)
  const oldest = overdue.reduce((m, c) => Math.min(m, Date.parse(`${c.due_date}T00:00:00Z`)), Number.POSITIVE_INFINITY)
  const oldestOverdueDays = Number.isFinite(oldest)
    ? Math.max(0, Math.round((Date.parse(`${todayKey}T00:00:00Z`) - oldest) / 86400000)) : 0
  const byDay = new Map<string, number>()
  for (const e of events) {
    if (!REVIEW_TYPES.has(e.activity_type)) continue
    const k = kstDayOf(e.created_at)
    if (k > addDays(todayKey, -14) && k <= todayKey) byDay.set(k, (byDay.get(k) || 0) + 1)
  }
  const vals = [...byDay.values()]
  const pacePerDay = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0
  return {
    due: dued.length, overdue: overdue.length, today: cards.filter(c => c.due_date === todayKey).length,
    oldestOverdueDays, pacePerDay,
    daysToClear: pacePerDay > 0 ? Math.ceil(dued.length / pacePerDay) : null,
    overCapacity: dued.length > DAILY_REVIEW_CAPACITY,
  }
}

/* ═════════ ⑤ XP 파생 — 관제실이 말하는 숫자와 앱이 저장한 숫자를 맞춘다 ═════════ */
export interface XpAudit {
  derived: number
  stored: number
  /** stored - derived. 0이 아니면 어느 한쪽이 틀렸다는 뜻이다. */
  diff: number
  diffPct: number
  /** 이벤트 조회가 상한에 닿아 파생이 원래 작을 수밖에 없는 상태인가 */
  truncated: boolean
}
export function deriveXp(events: MetricEvent[], progress: MetricProgress[]): number {
  let xp = 0
  for (const e of events) xp += answerXpOf(e.activity_type, e.is_correct)
  for (const p of progress) {
    if (isDoneStatus(p.status)) xp += moduleBonusOf(p.module_id, p.best_score)
    if (p.mastered_at) xp += XP.ghostClear
  }
  const reviewByDay = new Map<string, number>()
  for (const e of events) {
    if (!REVIEW_TYPES.has(e.activity_type) || !e.is_correct) continue
    const k = kstDayOf(e.created_at)
    reviewByDay.set(k, (reviewByDay.get(k) || 0) + 1)
  }
  for (const n of reviewByDay.values()) xp += Math.floor(n / XP.reviewComboEvery) * XP.reviewCombo
  return xp
}
export function xpAudit(events: MetricEvent[], progress: MetricProgress[], storedXp: number, truncated: boolean): XpAudit {
  const derived = deriveXp(events, progress)
  const diff = storedXp - derived
  return { derived, stored: storedXp, diff, diffPct: derived ? Math.round((diff / derived) * 1000) / 10 : 0, truncated }
}

/* ═════════ ⑥ 정합성 진단 — 관제실이 스스로를 의심한다 ═════════ */
export type IssueLevel = 'P0' | 'P1' | 'info'
export interface IntegrityIssue {
  id: string
  level: IssueLevel
  title: string
  detail: string
  /** 아빠가 지금 할 수 있는 행동 (없으면 관찰만) */
  action?: string
}

export interface IntegrityInput {
  today: StudyTime
  week: StudyTime[]
  xp: XpAudit
  progress: ProgressView
  debt: ReviewDebt
  /** 관제실이 파생한 뱃지 − 아이 기기가 실제로 받은 뱃지 */
  badgeOnlyInAdmin: string[]
  badgeOnlyInApp: string[]
  /** 조회가 상한에 닿았는가 (닿았다면 아래 모든 숫자가 과소 집계다) */
  eventsTruncated: boolean
  sessionsTruncated: boolean
  /** 데이터를 못 불러온 테이블 */
  failedTables: string[]
  /** v1.4.40 — 확장 월드(7~10)에 **기록이 하나라도** 있는가. 완료 여부가 아니라 기록으로 판정한다. */
  extTouched?: boolean
  /** v1.4.40 — 아이 지표에서 실제로 제외한 PC 문항 수 */
  pcEventCount?: number
  /** v1.4.40 — 최근 7일 정답률 분해. 복습을 '읽지 않고 넘겼는지' 판정하는 데 쓴다. */
  acc7?: AccuracySplit
  /** v1.4.40 — xp_events(지급 원장) 합계. learners.xp와 어긋나면 **기록이 유실된 신호**다. */
  xpEventsSum?: number
  /** v1.4.40 — 진도 시스템 밖에서 푼 문항 수 (지령 미션·소환진·에코 등) */
  offTrackCount?: number
}

export function integrityCheck(i: IntegrityInput): IntegrityIssue[] {
  const out: IntegrityIssue[] = []
  const min = (s: number) => `${Math.round(s / 60)}분`

  if (i.failedTables.length) {
    out.push({
      id: 'fetch_failed', level: 'P0', title: '일부 데이터를 불러오지 못했어요',
      detail: `${i.failedTables.join(', ')} 조회 실패. 지금 화면의 숫자는 마지막으로 성공한 값이라 실제와 다를 수 있어요.`,
      action: '새로고침(🔄)을 누르거나 잠시 후 다시 확인해 주세요.',
    })
  }
  if (i.eventsTruncated) {
    out.push({
      id: 'events_truncated', level: 'P0', title: '활동 기록이 조회 상한에 닿았어요',
      detail: '받아온 문항 수가 상한과 같습니다. 누적 정답률·취약 영역·반복 오답이 오래된 기록을 빼고 계산됐을 수 있어요.',
      action: '조회 기간을 줄이거나 상한을 올려야 합니다(코드 수정 필요).',
    })
  }
  /* ★v1.4.40★ `sessionsTruncated`는 v1.4.37부터 **선언되고 전달까지 됐지만 아무도 읽지 않는**
     죽은 신호였다(2026-08-16 검증에서 true를 넣고 호출해 확인 — 아무것도 안 떴다).
     L47이 "대시보드는 자기 자신을 의심하게 만들어라"라고 해 놓고 절반만 적용돼 있었다. */
  if (i.sessionsTruncated) {
    out.push({
      id: 'sessions_truncated', level: 'P1', title: '세션 기록이 조회 상한에 닿았어요',
      detail: '앱을 연 기록을 다 받아오지 못했습니다. v1.4.40부터 **아빠 PC 기록을 걸러내는 데 이 목록을 쓰기 때문에**, 잘린 구간의 PC 문항이 예한이 정답률·학습 시간에 섞여 있을 수 있어요.',
      action: '조회 상한을 올려야 합니다(코드 수정 필요).',
    })
  }
  if (i.today.corruptSessions > 0) {
    out.push({
      id: 'session_corrupt', level: 'P0', title: `오늘 세션 ${i.today.corruptSessions}건의 기록이 깨져 있어요`,
      detail: '세션이 자기 시작~종료 시각보다 긴 학습 시간을 주장합니다. 앱을 두 개 이상 띄웠을 때 생기는 현상이라, 원본 세션 시간은 신뢰할 수 없어요.',
      action: '화면의 학습 시간은 문항 기록으로 다시 계산한 값이니 그대로 믿어도 됩니다.',
    })
  }
  if (i.today.answers === 0 && i.today.openSec >= GOAL_SEC) {
    out.push({
      id: 'open_no_answer', level: 'P0', title: '앱은 켜져 있었지만 문제를 푼 기록이 없어요',
      detail: `오늘 앱이 켜져 있던 시간 ${min(i.today.openSec)} · 푼 문항 0개. 예전 관제실은 이걸 "학습 ${min(i.today.openSec)}"으로 셌습니다.`,
      action: '오늘 학습 시간은 0분으로 표시됩니다. 예한이가 실제로 앉았는지 확인해 주세요.',
    })
  } else if (i.today.idleSuspect) {
    out.push({
      id: 'idle_suspect', level: 'P1', title: '켜 둔 시간이 공부한 시간보다 훨씬 깁니다',
      detail: `켜 둔 시간 ${min(i.today.openSec)} · 실제로 문제를 푼 시간 ${min(i.today.focusSec)}.`,
      action: '학습이 끝나면 앱을 닫도록 알려 주세요. 켜 둔 시간은 출석·연속 출석에 들어가면 안 됩니다.',
    })
  }
  const desktopDays = i.week.filter(w => w.devices.includes('desktop')).length
  if (desktopDays > 0) {
    // v1.4.40 — 이제는 **실제로 빼고** 뺐다는 사실을 알린다. 예전엔 경고만 하고 숫자에는 그대로 넣었다.
    out.push({
      id: 'device_mix', level: 'info', title: 'PC에서 연 기록은 예한이 지표에서 뺐어요',
      detail: `최근 7일 중 ${desktopDays}일에 PC(desktop) 세션이 있습니다.`
        + (i.pcEventCount ? ` PC에서 푼 문항 ${i.pcEventCount.toLocaleString()}건은 정답률·학습 시간·출석 계산에서 제외했습니다.` : ' 학습 시간·출석 계산에서 제외했습니다.'),
      action: '학습자 화면(#/)은 예한이 폰에서만 열어 주세요 — PC로 열면 세션 기록이 계속 쌓입니다.',
    })
  }
  /* ★★v1.4.40 — 이 검사가 없어서 몇 주를 놓쳤다★★
     2026-08-16 독립 교차 검증에서 나온 이 프로젝트 최대의 결함이다:
       복습 2,026장 정답률 99.85%, **응답시간 중앙값 246ms**, 세션 #246은 376장을 157초에 전부 정답.
       라이트너 박스가 그 탭 속도로 승격돼 687장 중 401장(58%)이 7일·14일 주기로 올라가 있었다.
     `response_ms`는 처음부터 DB에 있었다 — 아무도 **속도를 지표로 보지 않았을 뿐**이다.
     정답률이 100%에 붙으면 그건 실력 신호가 아니라 **점검 신호**다. */
  const a7 = i.acc7
  if (a7 && a7.reviewTotal >= FAST_REVIEW_MIN_N && (a7.reviewFastPct ?? 0) >= FAST_REVIEW_SUSPECT_PCT) {
    out.push({
      id: 'review_too_fast', level: 'P1', title: '복습을 읽지 않고 넘긴 것 같아요',
      detail: `최근 7일 복습 ${a7.reviewTotal.toLocaleString()}장 중 ${a7.reviewFastPct}%가 1초 안에 채점됐습니다`
        + `(정답률 ${a7.reviewPct ?? 0}%). 뒷면을 읽고 낸 답으로 보기 어려운 속도예요.`,
      action: '이렇게 넘긴 카드도 "맞음"으로 처리돼 복습 주기가 14일까지 늘어납니다 — 실제로는 잊어버릴 카드예요. 예한이와 한 판 같이 해 보세요.',
    })
  }
  /* ★v1.4.40 — XP는 숫자가 **셋**인데 둘만 대조하고 있었다★
     2026-08-16 실측: learners.xp 44,569 / 기록 파생 44,046 / **xp_events 합 43,011**.
     xp_events는 "앱이 XP를 줄 때마다 남기는 원장"이라, 저장값과 크게 벌어지면
     그 사이의 지급 기록이 **전송되지 못하고 사라졌다**는 신호다(오프라인 큐가 4xx를 버리던 결함과 같은 계열). */
  if (i.xpEventsSum != null && i.xp.stored > 0) {
    const gap = i.xp.stored - i.xpEventsSum
    const gapPct = Math.round((gap / i.xp.stored) * 1000) / 10
    if (Math.abs(gapPct) >= 3) {
      out.push({
        id: 'xp_ledger_gap', level: 'info',
        title: `XP 지급 기록이 ${Math.abs(gap).toLocaleString()} 모자라요`,
        detail: `앱이 저장한 XP ${i.xp.stored.toLocaleString()} · 지급 기록(xp_events) 합계 ${i.xpEventsSum.toLocaleString()} (${gapPct > 0 ? '-' : '+'}${Math.abs(gapPct)}%).`
          + ' 지급 기록이 서버에 닿지 못한 적이 있다는 뜻입니다.',
        action: '예한이 폰의 "정보" 화면에 「전송하지 못한 기록」이 떠 있는지 확인해 주세요.',
      })
    }
  }
  if (i.offTrackCount && i.offTrackCount > 0) {
    out.push({
      id: 'off_track_learning', level: 'info',
      title: `진도에 안 잡히는 학습이 ${i.offTrackCount.toLocaleString()}문항 있어요`,
      detail: '지령 미션(듣기)·문장 소환진·에코 사냥·복습은 문항 기록에는 남지만 "모듈 진도"에는 들어가지 않습니다. 진도바가 안 움직여도 공부를 안 한 게 아니에요.',
    })
  }
  if (Math.abs(i.xp.diff) > 0 && !i.xp.truncated) {
    out.push({
      id: 'xp_gap', level: Math.abs(i.xp.diffPct) >= 5 ? 'P1' : 'info',
      title: `저장된 XP와 기록으로 계산한 XP가 ${Math.abs(i.xp.diff).toLocaleString()} 차이 나요`,
      detail: `앱이 저장한 값 ${i.xp.stored.toLocaleString()} · 활동 기록으로 다시 계산한 값 ${i.xp.derived.toLocaleString()} (${i.xp.diffPct > 0 ? '+' : ''}${i.xp.diffPct}%).`,
      action: '차이가 계속 커지면 XP 산식이 한쪽에서만 바뀐 것입니다(CONTRACT §2).',
    })
  }
  if (i.badgeOnlyInAdmin.length) {
    out.push({
      id: 'badge_missing_app', level: 'P1',
      title: `예한이가 못 받은 뱃지가 ${i.badgeOnlyInAdmin.length}개 있어요`,
      detail: `서버 기록으로는 조건을 채웠는데 아이 화면에는 없습니다: ${i.badgeOnlyInAdmin.join(', ')}`,
      action: '아래 "뱃지 되메우기"를 누르면 예한이 도감에 실제로 들어갑니다.',
    })
  }
  if (i.badgeOnlyInApp.length) {
    out.push({
      id: 'badge_local_only', level: 'info',
      title: `아이 기기에서만 판정되는 뱃지 ${i.badgeOnlyInApp.length}개`,
      detail: `서버 기록으로는 되짚을 수 없는 뱃지입니다(분류 상자·속사 사냥 등): ${i.badgeOnlyInApp.join(', ')}`,
    })
  }
  /* ★v1.4.40 — 문구 결함 봉합★ 2026-08-16 라이브에서 실제로 이렇게 떠 있었다:
       "복습이 116장 밀렸어요 / 그중 **0장**은 기한이 지났고, 가장 오래된 건 **0일** 지났습니다.
        지금 페이스(하루 204장)로는 다 갚는 데 약 **1일** 걸려요."  ← 그리고 처방은 "2~3일 복습만 하세요"
     세 가지가 동시에 틀렸다:
       ① `due`(오늘 몫 포함)를 "밀렸다"고 불렀다 — 실제 overdue는 0이었다.
       ② overdue=0인데 "0장·0일"을 그대로 출력했다.
       ③ pacePerDay가 **복습한 날만** 평균이라 낙관 편향(그 204장은 246ms 연타로 만들어진 숫자다).
     → 밀린 것과 오늘 몫을 다른 문장으로 말하고, 0인 절은 아예 쓰지 않는다. */
  if (i.debt.overdue > 0) {
    const clear = i.debt.daysToClear
    out.push({
      id: 'review_debt', level: 'P1', title: `기한이 지난 복습이 ${i.debt.overdue}장 있어요`,
      detail: `가장 오래된 건 ${i.debt.oldestOverdueDays}일 지났습니다. 오늘 만기까지 합치면 ${i.debt.due}장이에요.`
        + (clear ? ` 최근에 복습한 날의 평균(하루 ${i.debt.pacePerDay}장)대로면 약 ${clear}일치 분량입니다.` : ' 최근 복습 기록이 없어 예상 일수를 낼 수 없어요.'),
      action: '새 월드를 여는 대신 며칠은 복습 광산부터 도는 편이 기억에 훨씬 남습니다.',
    })
  } else if (i.debt.overCapacity) {
    out.push({
      id: 'review_today_heavy', level: 'info', title: `오늘 만기 복습이 ${i.debt.due}장이에요`,
      detail: '기한이 지난 카드는 없습니다 — 밀린 게 아니라 오늘 몫이 많은 날이에요.',
      action: `아이 화면은 하루 ${DAILY_REVIEW_CAPACITY}장까지만 보여 줍니다. 나머지는 내일로 넘어가니 그대로 두셔도 됩니다.`,
    })
  }
  if (i.progress.extOpen && i.progress.extDone === 0 && !i.extTouched) {
    out.push({
      id: 'ext_untouched', level: 'info', title: '월드 7~10이 열렸지만 아직 한 번도 안 들어갔어요',
      detail: `아이 화면 기준 진도는 ${i.progress.done}/${i.progress.total}입니다. 새 월드 24개가 통째로 비어 있어요.`,
      action: '독해 던전 P1(그림자 문장)부터 같이 한 판 해 보세요.',
    })
  }
  const order: Record<IssueLevel, number> = { P0: 0, P1: 1, info: 2 }
  return out.sort((a, b) => order[a.level] - order[b.level])
}

/* ═════════ ⑦ 오늘의 처방 — 데이터가 말하는 '지금 할 일' ═════════ */
export interface CoachTip { emoji: string; text: string }

export function coachTips(a: {
  today: StudyTime; acc7: AccuracySplit; debt: ReviewDebt; progress: ProgressView
  weakest: { name: string; pct: number } | null
  streak: number
}): CoachTip[] {
  const out: CoachTip[] = []
  if (a.today.answers === 0) {
    out.push({ emoji: '🎯', text: `오늘은 아직 시작 전이에요. 15분 한 판이면 연속 출석 ${a.streak + 1}일째가 됩니다.` })
  } else if (a.today.focusSec < GOAL_SEC) {
    out.push({ emoji: '⏱', text: `오늘 ${Math.round(a.today.focusSec / 60)}분 했어요. ${Math.ceil((GOAL_SEC - a.today.focusSec) / 60)}분만 더 하면 출석 인정입니다.` })
  } else {
    out.push({ emoji: '✅', text: `오늘 목표 15분을 넘겼어요(${Math.round(a.today.focusSec / 60)}분). 여기서 멈춰도 좋은 하루입니다.` })
  }
  // v1.4.40 — '밀린 것'과 '오늘 몫'을 섞어 부르지 않는다. 아이 화면은 하루 상한까지만 보여 준다.
  if (a.debt.overdue > 0) {
    out.push({ emoji: '⛏️', text: `기한 지난 복습이 ${a.debt.overdue}장 있어요. 새 진도보다 복습 광산이 먼저입니다 — 밀린 카드가 그대로 시험 범위예요.` })
  } else if (a.debt.due > DAILY_REVIEW_CAPACITY) {
    out.push({ emoji: '⛏️', text: `오늘 만기 복습 ${a.debt.due}장 — 기한 지난 건 없어요. 아이 화면엔 ${DAILY_REVIEW_CAPACITY}장까지만 나오고 나머지는 내일로 넘어갑니다.` })
  } else if (a.debt.due > 0) {
    out.push({ emoji: '⛏️', text: `오늘 캘 복습 카드 ${a.debt.due}장. 이건 오늘 안에 끝낼 수 있는 양이에요.` })
  }
  if (a.weakest && a.weakest.pct < 70) {
    out.push({ emoji: '🔍', text: `가장 약한 곳은 "${a.weakest.name}" ${a.weakest.pct}%예요. 여기만 다시 한 판 돌리면 체감이 큽니다.` })
  }
  if (a.acc7.newPct !== null && a.acc7.reviewPct !== null && a.acc7.reviewPct - a.acc7.newPct >= 25) {
    out.push({ emoji: '📊', text: `최근 7일 복습 ${a.acc7.reviewPct}% vs 신규 ${a.acc7.newPct}%. 아는 걸 다시 보는 시간이 많아요 — 새 단원 비중을 조금 올려도 됩니다.` })
  }
  if (a.progress.extOpen && a.progress.extDone === 0 && a.progress.baseDone === a.progress.baseTotal) {
    out.push({ emoji: '📖', text: '기준 커리큘럼 28개를 전부 끝냈어요. 월드 7~10(24단원)이 다음 목표입니다.' })
  }
  return out.slice(0, 4)
}
