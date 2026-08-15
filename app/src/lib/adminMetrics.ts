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

/* ═════════ 입력 타입 (관제실이 서버에서 받은 행의 최소 형태) ═════════ */
export interface MetricEvent {
  activity_type: string
  is_correct: boolean
  created_at: string
  module_id: string
  response_ms: number | null
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

/** 문항 타임스탬프에서 '실제로 손이 움직인 시간'을 낸다. 5분 이상 벌어진 구간은 버린다. */
export function focusSecOfDay(events: MetricEvent[], dayKey: string): number {
  const ts = events
    .filter(e => kstDayOf(e.created_at) === dayKey)
    .map(e => Date.parse(e.created_at))
    .filter(t => Number.isFinite(t))
    .sort((a, b) => a - b)
  if (ts.length === 0) return 0
  let sec = 0
  for (let i = 1; i < ts.length; i++) {
    const g = (ts[i] - ts[i - 1]) / 1000
    if (g > 0 && g < ACTIVE_GAP_SEC) sec += g
  }
  return Math.round(sec + EDGE_GRACE_SEC)
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
}

export function isAssessed(e: MetricEvent): boolean {
  return !NON_ASSESSED_TYPES.has(e.activity_type) && !SELF_GRADED_TYPES.has(e.activity_type)
}

export function accuracyOf(events: MetricEvent[]): AccuracySplit {
  let nT = 0, nC = 0, rT = 0, rC = 0, ex = 0, bT = 0, bC = 0
  for (const e of events) {
    bT++; if (e.is_correct) bC++
    if (!isAssessed(e)) { ex++; continue }
    if (REVIEW_TYPES.has(e.activity_type)) { rT++; if (e.is_correct) rC++ }
    else { nT++; if (e.is_correct) nC++ }
  }
  const pct = (c: number, t: number) => (t ? Math.round((c / t) * 100) : null)
  return {
    newTotal: nT, newCorrect: nC, newPct: pct(nC, nT),
    reviewTotal: rT, reviewCorrect: rC, reviewPct: pct(rC, rT),
    excluded: ex, blendedPct: pct(bC, bT),
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
    out.push({
      id: 'device_mix', level: 'P1', title: 'PC에서 연 기록이 예한이 기록에 섞여 있어요',
      detail: `최근 7일 중 ${desktopDays}일에 desktop 세션이 있습니다. 아빠가 확인하려고 학습자 앱을 연 시간도 아이 학습 시간·출석으로 잡힙니다.`,
      action: '확인은 관제실(#/admin)에서 하시고, 학습자 화면은 예한이 폰에서만 열어 주세요.',
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
  if (i.debt.overCapacity) {
    out.push({
      id: 'review_debt', level: 'P1', title: `복습이 ${i.debt.due}장 밀렸어요`,
      detail: `그중 ${i.debt.overdue}장은 기한이 지났고, 가장 오래된 건 ${i.debt.oldestOverdueDays}일 지났습니다. `
        + (i.debt.daysToClear ? `지금 페이스(하루 ${i.debt.pacePerDay}장)로는 다 갚는 데 약 ${i.debt.daysToClear}일 걸려요.` : '최근 복습 기록이 없어 예상 일수를 낼 수 없어요.'),
      action: '새 월드를 여는 대신 2~3일은 복습 광산만 하는 편이 기억에 훨씬 남습니다.',
    })
  }
  if (i.progress.extOpen && i.progress.extDone === 0) {
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
  if (a.debt.overCapacity) {
    out.push({ emoji: '⛏️', text: `복습이 ${a.debt.due}장 밀렸어요. 새 진도보다 복습 광산이 먼저입니다 — 밀린 카드가 그대로 시험 범위예요.` })
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
