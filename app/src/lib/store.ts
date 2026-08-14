// 전역 상태 + 로컬 우선 기록 + Supabase 비동기 동기화 큐 (오프라인 내성)
import { db, fetchLearner, type Learner } from './supabase'
import { levelForXp, XP, answerXpOf, moduleBonusOf } from './xp'
import { todayStr, kstYesterdayStr, kstDateStr } from './leitner'

export interface ProgressEntry {
  module_id: string
  status: 'locked' | 'available' | 'in_progress' | 'completed' | 'mastered'
  best_score: number | null
  attempts: number
  // ── v1.3.0 유령 보스 (CONTRACT v1.3 §8) — 없으면 undefined (구버전 localStorage 하위호환) ──
  completed_at?: string | null
  stars?: number | null
  mastered_at?: string | null
}

export interface LocalState {
  learnerId: string | null
  nickname: string
  xp: number
  level: number
  streak_days: number
  last_active_date: string | null
  attendance: string[]
  diagDone: string[]
  placement: string | null
  progress: Record<string, ProgressEntry>
  sessionId: number | null
  sessionStart: number | null
  // ── v1.2.0 추가 (없으면 loadLocal이 기본값 채움 — 하위호환) ──
  bossWins: string[]            // 보스전 정답을 낸 모듈 id (boss_slayer 뱃지)
  reviewTotal: number           // 복습 카드 누적 정답 수 (review_* 뱃지)
  reviewDay: { date: string; correct: number } // 오늘 복습 정답 수 (콤보 보너스 판정)
  dailyXp: { date: string; course: number; review: number } // 오늘의 학습 밸런스 (50:50 위젯)
  balanceDays: string[]         // 모험+복습 둘 다 한 날짜들 (balance_7 뱃지, 최근 60일 유지)
  forgeFound: string[]          // v1.4.0 소환진에서 발견한 문장(정규화, 발견 XP 문장당 1회)
  // ── v1.4.21 뱃지용 로컬 카운터 (없으면 loadLocal이 기본값 채움 — 하위호환, L17 additive) ──
  legendWords: string[]         // 👑 전설(라이트너 박스 5)까지 키운 어휘 워드몬
  sortPerfect: number           // 분류 상자를 한 번에 전부 맞힌 횟수
  rapidBest: number             // 속사 사냥 한 판 최고 기록
}

const V2_DEFAULTS = {
  bossWins: [] as string[],
  reviewTotal: 0,
  reviewDay: { date: '', correct: 0 },
  dailyXp: { date: '', course: 0, review: 0 },
  balanceDays: [] as string[],
  forgeFound: [] as string[],
  legendWords: [] as string[],
  sortPerfect: 0,
  rapidBest: 0,
}

const LS_KEY = 'wordcraft_state_v1'
const QUEUE_KEY = 'wordcraft_queue_v1'

export function loadLocal(): LocalState {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...V2_DEFAULTS, ...(JSON.parse(raw) as LocalState) } // 구버전 상태에 v2 필드 보충
  } catch { /* 첫 실행 */ }
  return {
    learnerId: null, nickname: '예한', xp: 0, level: 1, streak_days: 0,
    last_active_date: null, attendance: [], diagDone: [], placement: null, progress: {},
    sessionId: null, sessionStart: null, ...V2_DEFAULTS,
  }
}

export function saveLocal(s: LocalState) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)) } catch { /* 저장 불가 무시 */ }
}

// ---------- 동기화 큐 (네트워크 실패 시 로컬 보존 → 재시도) ----------
interface QueueItem { kind: 'insert' | 'upsert' | 'update'; table: string; payload: unknown; conflict?: string; query?: string; ignore?: boolean }

function loadQueue(): QueueItem[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]') } catch { return [] }
}
function saveQueue(q: QueueItem[]) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-500))) } catch { /* */ }
}

let flushing = false
export async function flushQueue() {
  if (flushing) return
  flushing = true
  try {
    // 한 번에 하나씩 — 매 반복마다 localStorage에서 큐를 다시 읽는다.
    // 전송 await 도중 enqueue된 항목을, 옆 메모리 스냅샷을 saveQueue로 저장하며 덮어써
    // 유실하던 레이스를 봉합(XP·배지·복습카드가 전부 사라지던 근본 원인).
    while (true) {
      const head = loadQueue()[0]
      if (!head) break
      try {
        if (head.kind === 'insert') await db.insert(head.table, head.payload as Record<string, unknown>)
        else if (head.kind === 'upsert') await db.upsert(head.table, head.payload as Record<string, unknown>, head.conflict || '', head.ignore)
        else await db.update(head.table, head.query || '', head.payload as Record<string, unknown>)
      } catch (e) {
        if (!String(e).includes('supabase 4')) break // 네트워크 등 — 맨 앞 항목 유지, 다음 기회 재시도
        // 4xx = 재시도 무의미 → 아래에서 제거하고 계속
      }
      const q = loadQueue() // await 이후 최신 큐를 다시 읽기 (그 사이 enqueue된 항목 보존)
      q.shift()             // 방금 처리한 맨 앞 1건만 제거
      saveQueue(q)
    }
  } finally { flushing = false }
}

export function enqueue(item: QueueItem) {
  const q = loadQueue()
  q.push(item)
  saveQueue(q)
  void flushQueue()
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushQueue())
  setInterval(() => void flushQueue(), 15000)
}

// ---------- 기록 헬퍼 (로컬 즉시 반영 + 큐 동기화) ----------
export function recordAnswer(s: LocalState, p: {
  module_id: string; activity_type: string; question_id: string
  question_text?: string; given_answer?: string; correct_answer?: string
  is_correct: boolean; response_ms?: number
}) {
  // 응답시간 상한 120초 절사 (A-019 — 탭 이탈 등 비정상 값이 통계를 오염시키지 않도록)
  const clamped = { ...p, response_ms: p.response_ms != null ? Math.min(p.response_ms, 120000) : undefined }
  enqueue({ kind: 'insert', table: 'answer_events', payload: { learner_id: s.learnerId, session_id: s.sessionId, ...clamped } })
}

/** 복습 계열 XP인지 (오늘의 학습 밸런스 분류) */
const isReviewReason = (reason: string) => reason === 'review_correct' || reason === 'review_combo'

export function recordXp(s: LocalState, amount: number, reason: string, module_id?: string): LocalState {
  // 출석·스트릭은 여기서 건드리지 않는다 — 하루 15분 이상 학습 시 하트비트가 markAttendance 호출 (2026-07-16 규칙)
  const xp = s.xp + amount
  const level = levelForXp(xp)
  enqueue({ kind: 'insert', table: 'xp_events', payload: { learner_id: s.learnerId, amount, reason, module_id: module_id || null } })
  enqueue({ kind: 'update', table: 'learners', query: `id=eq.${s.learnerId}`, payload: { xp, level } })
  // 오늘의 학습 밸런스 (모험 vs 복습, 날짜 바뀌면 리셋)
  const today = todayStr()
  const prevDaily = s.dailyXp?.date === today ? s.dailyXp : { date: today, course: 0, review: 0 }
  const dailyXp = isReviewReason(reason)
    ? { ...prevDaily, review: prevDaily.review + amount }
    : { ...prevDaily, course: prevDaily.course + amount }
  // 황금 밸런스: 하루에 모험·복습 둘 다 했으면 오늘을 밸런스 일로 기록
  let balanceDays = s.balanceDays || []
  if (dailyXp.course > 0 && dailyXp.review > 0 && !balanceDays.includes(today)) {
    balanceDays = [...balanceDays, today].slice(-60)
  }
  const ns = { ...s, xp, level, dailyXp, balanceDays }
  saveLocal(ns)
  return ns
}

/** 복습 정답 1건 반영 — 누적/일일 카운터 갱신 + 콤보 보너스 도달 여부 반환 */
export function bumpReviewCorrect(s: LocalState, comboEvery: number): { s: LocalState; comboHit: boolean } {
  const today = todayStr()
  const day = s.reviewDay?.date === today ? s.reviewDay : { date: today, correct: 0 }
  const correct = day.correct + 1
  const ns: LocalState = { ...s, reviewTotal: (s.reviewTotal || 0) + 1, reviewDay: { date: today, correct } }
  saveLocal(ns)
  return { s: ns, comboHit: correct % comboEvery === 0 }
}

/** v1.4.21 뱃지용 로컬 카운터 갱신 (서버 이벤트로 되짚을 수 없는 것만 여기에 쌓는다).
 *  ⚠️ 이 값들은 **기기 로컬**이다 — 기기를 바꾸면 카운터는 0부터지만, 이미 받은 뱃지는
 *     badges 테이블에 남아 있으므로 사라지지 않는다(획득은 영구, 진행도만 로컬). */
export function bumpLegendWord(s: LocalState, cardId: string): LocalState {
  const cur = s.legendWords || []
  if (cur.includes(cardId)) return s
  const ns = { ...s, legendWords: [...cur, cardId].slice(-500) }
  saveLocal(ns)
  return ns
}
export function bumpSortPerfect(s: LocalState): LocalState {
  const ns = { ...s, sortPerfect: (s.sortPerfect || 0) + 1 }
  saveLocal(ns)
  return ns
}
export function setRapidBest(s: LocalState, hit: number): LocalState {
  if (hit <= (s.rapidBest || 0)) return s
  const ns = { ...s, rapidBest: hit }
  saveLocal(ns)
  return ns
}

export function recordProgress(s: LocalState, module_id: string, patch: Partial<ProgressEntry> & { total_time_seconds?: number; completed?: boolean }): LocalState {
  const prev = s.progress[module_id] || { module_id, status: 'available' as const, best_score: null, attempts: 0 }
  const entry: ProgressEntry = {
    ...prev,
    module_id,
    status: patch.status || prev.status,
    best_score: patch.best_score != null ? Math.max(patch.best_score, prev.best_score ?? 0) : prev.best_score,
    attempts: prev.attempts + (patch.completed ? 1 : 0),
  }
  const payload: Record<string, unknown> = {
    learner_id: s.learnerId, module_id, status: entry.status, best_score: entry.best_score,
    attempts: entry.attempts, updated_at: new Date().toISOString(),
  }
  if (patch.completed) {
    const now = new Date().toISOString()
    payload.completed_at = now
    entry.completed_at = entry.completed_at || now // 최초 완료 시각 로컬 보존 (유령 D+2 판정용)
  }
  if (patch.total_time_seconds) payload.total_time_seconds = patch.total_time_seconds
  enqueue({ kind: 'upsert', table: 'module_progress', payload, conflict: 'learner_id,module_id' })
  const ns = { ...s, progress: { ...s.progress, [module_id]: entry } }
  saveLocal(ns)
  return ns
}

/** v1.3.0 유령 보스 통과 기록 (CONTRACT v1.3 §8) — additive: status='mastered', stars=max(기존,이번), mastered_at 최초 1회.
 *  반환: { s, firstMastery } — 최초 통과일 때만 ghost_boss 보너스 지급 판단용 */
export function recordGhostResult(s: LocalState, module_id: string, stars: number): { s: LocalState; firstMastery: boolean } {
  const prev = s.progress[module_id] || { module_id, status: 'completed' as const, best_score: null, attempts: 0 }
  const firstMastery = !prev.mastered_at && (prev.stars == null || prev.stars <= 0)
  const newStars = Math.max(prev.stars ?? 0, stars) // 별 하향 없음
  const mastered_at = prev.mastered_at || new Date().toISOString()
  const entry: ProgressEntry = { ...prev, status: 'mastered', stars: newStars, mastered_at }
  enqueue({
    kind: 'upsert', table: 'module_progress', conflict: 'learner_id,module_id',
    payload: {
      learner_id: s.learnerId, module_id, status: 'mastered', best_score: prev.best_score,
      attempts: prev.attempts, stars: newStars, mastered_at, updated_at: new Date().toISOString(),
    },
  })
  const ns = { ...s, progress: { ...s.progress, [module_id]: entry } }
  saveLocal(ns)
  return { s: ns, firstMastery }
}

export function recordBadge(s: LocalState, badge_id: string) {
  enqueue({ kind: 'upsert', table: 'badges', payload: { learner_id: s.learnerId, badge_id }, conflict: 'learner_id,badge_id' })
}

// ---------- 세션 (사용시간 기록) ----------
// 모바일 WebView는 pagehide/beforeunload가 거의 발생하지 않아, 종료 1회 기록에만 의존하면
// duration_seconds가 null로 남는다(관제실 "오늘 학습 시간" 0분 원인). → 30초 하트비트로 주기
// 갱신 + 백그라운드 전환(visibilitychange) 시 확정 기록. 시간은 "활성 구간"만 누적해, 화면
// 잠금/백그라운드로 얼어붙은 시간이 과대 집계되지 않도록 한다.
let _activeMs = 0 // 이번 세션 누적 활성 시간(ms) — 모듈 스코프(리로드=새 세션이라 초기화 정상)
let _lastTick = 0 // 마지막 틱 시각(ms)

export async function startSession(s: LocalState): Promise<LocalState> {
  const start = Date.now()
  let sessionId: number | null = null
  try {
    const rows = await db.insert('sessions', { learner_id: s.learnerId, device: navigator.userAgent.includes('Mobile') ? 'mobile' : 'desktop' })
    sessionId = (rows[0] as { id?: number })?.id ?? null
  } catch { /* 오프라인 — 세션 없이 진행, answer_events는 session_id null */ }
  _activeMs = 0
  _lastTick = start
  const ns = { ...s, sessionId, sessionStart: start }
  saveLocal(ns)
  return ns
}

// 활성 시간 누적 후 서버 duration 반영. end=true면 종료 확정(ended_at + 신뢰 큐 전송).
// 반환: 이번 틱에서 출석이 새로 인정됐으면 갱신된 상태(LocalState), 아니면 null (App이 화면에 반영)
function tickSession(end: boolean): LocalState | null {
  const s = loadLocal()
  if (!s.sessionId) return null
  const now = Date.now()
  const delta = now - _lastTick
  _lastTick = now
  let attended: LocalState | null = null
  // 정상 경과(0~2분)만 누적 — 그 이상은 백그라운드/절전으로 얼어붙은 것이라 학습시간 아님
  if (delta > 0 && delta < 120000) {
    _activeMs += delta
    // 출석 판정 (2026-07-16 규칙): 오늘 누적 활성 학습 15분 도달 순간 출석 도장
    const dailySec = addDailyActiveSec(Math.round(delta / 1000))
    if (dailySec >= ATTENDANCE_MIN_SEC && !(s.attendance || []).includes(todayStr())) {
      attended = markAttendance(s)
    }
  }
  const dur = Math.round(_activeMs / 1000)
  if (dur <= 0 && !end) return attended
  const payload: Record<string, unknown> = { duration_seconds: dur }
  if (end) {
    payload.ended_at = new Date().toISOString()
    enqueue({ kind: 'update', table: 'sessions', query: `id=eq.${s.sessionId}`, payload }) // 오프라인 내성
  } else {
    db.update('sessions', `id=eq.${s.sessionId}`, payload).catch(() => {}) // 하트비트 — best-effort
  }
  return attended
}

// 30초 주기 하트비트(App의 setInterval에서 호출) — 출석이 새로 인정되면 갱신 상태 반환
export function heartbeatSession(): LocalState | null { return tickSession(false) }
// 백그라운드 전환/페이지 종료 — 사용시간 확정 기록
export function endSession() { void tickSession(true) }
// 포그라운드 복귀 — 그 사이 얼어붙은 시간은 학습 아님, 구간만 리셋(누적 제외)
export function resumeSession() { _lastTick = Date.now() }

// ---------- 출석 & 스트릭 (2026-07-16 규칙: 하루 15분 이상 학습해야 출석 인정 — Dio님 지시) ----------
export const ATTENDANCE_MIN_SEC = 15 * 60

// 오늘 누적 활성 학습시간(초) — LocalState와 분리된 키(하트비트 저장이 React 상태 saveLocal과 경합하지 않도록)
const DAILY_KEY = 'wordcraft_daily_active_v1'

export function getDailyActiveSec(): number {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null') as { date: string; sec: number } | null
    return d && d.date === todayStr() ? d.sec : 0
  } catch { return 0 }
}

function addDailyActiveSec(sec: number): number {
  const total = getDailyActiveSec() + sec
  try { localStorage.setItem(DAILY_KEY, JSON.stringify({ date: todayStr(), sec: total })) } catch { /* */ }
  return total
}

/** 오늘 출석 도장 — 일일 학습 15분 도달 시에만 호출. 스트릭 갱신 + 서버 반영 */
export function markAttendance(s: LocalState): LocalState {
  const today = todayStr()
  if ((s.attendance || []).includes(today)) return s
  // 서버가 이미 오늘 출석을 알고 있으면(기기 교체 등) 스트릭은 건드리지 않고 로컬 출석 칩만 채움
  if (s.last_active_date === today) {
    const ns = { ...s, attendance: [...(s.attendance || []), today].slice(-14) }
    saveLocal(ns)
    return ns
  }
  // "어제"는 반드시 KST로 (구버전 toISOString(UTC) 계산이 오전 9시 이전 스트릭 리셋 버그의 원인 — 7/16 봉합)
  const yesterday = kstYesterdayStr()
  const streak = s.last_active_date === yesterday ? s.streak_days + 1 : 1
  const attendance = [...(s.attendance || []), today].slice(-14) // 주간 출석 칩용, 최근 14일 유지
  const ns = { ...s, streak_days: streak, last_active_date: today, attendance }
  enqueue({ kind: 'update', table: 'learners', query: `id=eq.${ns.learnerId}`, payload: { streak_days: streak, last_active_date: today } })
  saveLocal(ns)
  return ns
}

/** 출석 배열(14일 캡 미달 = 전 이력 보존)로 스트릭 자가 복구 — 과거 UTC 버그로 낮게 저장된 값 교정 */
export function repairStreak(s: LocalState): LocalState {
  const att = s.attendance || []
  if (!att.length || att.length >= 14) return s
  const last = att[att.length - 1]
  if (last !== todayStr() && last !== kstYesterdayStr()) return s // 이어지는 중인 스트릭만 교정
  const t = (d: string) => Date.parse(d + 'T00:00:00Z')
  let run = 1
  for (let i = att.length - 1; i > 0; i--) {
    if (t(att[i]) - t(att[i - 1]) === 86400000) run++
    else break
  }
  if (run <= s.streak_days) return s
  const ns = { ...s, streak_days: run }
  enqueue({ kind: 'update', table: 'learners', query: `id=eq.${ns.learnerId}`, payload: { streak_days: run } })
  saveLocal(ns)
  return ns
}

// ---------- 초기화 (서버 상태 병합) ----------
// preLearner: 기기(익명) 세션에 바인딩된 아이를 미리 조회해 넘기면 그 아이로 초기화한다(다가구).
// 없으면 레거시 fetchLearner(FAMILY_CODE=예한) — 기존 흐름 100% 보존.
export async function initLearner(s: LocalState, preLearner?: Learner): Promise<LocalState> {
  try {
    const learner: Learner = preLearner ?? await fetchLearner()
    const rows = await db.select('module_progress', `learner_id=eq.${learner.id}&order=module_id.asc&limit=5000`)
    const progress: Record<string, ProgressEntry> = { ...s.progress }
    for (const r of rows as unknown as (ProgressEntry & { learner_id: string; completed_at?: string | null })[]) {
      progress[r.module_id] = {
        module_id: r.module_id, status: r.status, best_score: r.best_score, attempts: r.attempts,
        // v1.3.0: 유령 보스 판정 필드 서버 복원 (기기 교체·로컬 초기화에도 안전)
        completed_at: r.completed_at ?? progress[r.module_id]?.completed_at ?? null,
        stars: r.stars ?? progress[r.module_id]?.stars ?? null,
        mastered_at: r.mastered_at ?? progress[r.module_id]?.mastered_at ?? null,
      }
    }
    // 진단 완료 목록을 서버 progress(DIAG-* 행)에서도 복원 — 로컬 초기화/기기 교체에도 풀 스캔 뱃지 정확 (v1.2.0)
    const diagDone = Array.from(new Set([
      ...s.diagDone,
      ...Object.keys(progress).filter(k => k.startsWith('DIAG-') && (progress[k].status === 'completed' || progress[k].status === 'mastered')).map(k => k.slice(5)),
    ]))
    const ns: LocalState = {
      ...s,
      learnerId: learner.id,
      nickname: learner.nickname,
      xp: Math.max(s.xp, learner.xp),
      level: Math.max(s.level, learner.level),
      streak_days: Math.max(s.streak_days, learner.streak_days),
      last_active_date: s.last_active_date || learner.last_active_date,
      progress,
      diagDone,
    }
    saveLocal(ns)
    return ns
  } catch {
    return s // 오프라인 — 로컬 상태로 진행
  }
}


/** v1.4.3 공유 밸런스 — 서버(answer_events·module_progress·sessions)에서 오늘 밸런스·주간 출석·오늘 활성시간을
 *  관제실 xpOf와 1:1 산식으로 파생해 로컬과 병합(항목별 max/합집합 — L17 additive). 기기 교체·새 기기에도 게이지 정확. */
// ★L12·L27★ 산식을 여기에 다시 쓰지 않는다. xp.ts의 단일 정의만 부른다.
//   (v1.4.17에서 이 파일에 복사해 둔 어휘 산식이 v1.4.18 소스 복구 때 유실돼 관제실이 51% 부풀었다.)
const xpOfEvent = answerXpOf

export async function syncSharedDaily(s: LocalState): Promise<LocalState> {
  if (!s.learnerId) return s
  try {
    const today = todayStr()
    // 1) 오늘 answer_events → 모험(course)/복습(review) XP
    const ev = await db.select('answer_events', `learner_id=eq.${s.learnerId}&select=activity_type,is_correct,created_at&order=created_at.desc&limit=2000`)
    let course = 0, review = 0, reviewCorrectToday = 0
    for (const e of ev as unknown as { activity_type: string; is_correct: boolean; created_at: string }[]) {
      if (kstDateStr(new Date(e.created_at)) !== today) continue
      const x = xpOfEvent(e.activity_type, e.is_correct)
      if (e.activity_type === 'review') { review += x; if (e.is_correct) reviewCorrectToday++ }
      else course += x
    }
    review += Math.floor(reviewCorrectToday / XP.reviewComboEvery) * XP.reviewCombo
    // 2) module_progress → 오늘 완료/진단/유령 보너스 (course)
    const prog = await db.select('module_progress', `learner_id=eq.${s.learnerId}&select=module_id,status,best_score,completed_at,updated_at,mastered_at&order=module_id.asc&limit=5000`)
    for (const p of prog as unknown as { module_id: string; status: string; best_score?: number | null; completed_at?: string | null; updated_at?: string | null; mastered_at?: string | null }[]) {
      if (p.status === 'completed' || p.status === 'mastered') {
        const k = kstDateStr(new Date(p.completed_at || p.updated_at || Date.now()))
        if (k === today) course += moduleBonusOf(p.module_id, p.best_score)  // ★단일 정의(xp.ts)★
      }
      if (p.mastered_at && kstDateStr(new Date(p.mastered_at)) === today) course += XP.ghostClear
    }
    // 3) 오늘 밸런스 병합 (항목별 max — 로컬 즉시 반영분 보존)
    const prevDaily = s.dailyXp?.date === today ? s.dailyXp : { date: today, course: 0, review: 0 }
    const dailyXp = { date: today, course: Math.max(prevDaily.course, course), review: Math.max(prevDaily.review, review) }
    // 4) 주간 출석칩 — 최근 14일 sessions 일별 합 ≥15분 = 출석일 (로컬과 합집합)
    const sinceIso = new Date(Date.now() - 14 * 86400000).toISOString()
    const sess = await db.select('sessions', `learner_id=eq.${s.learnerId}&started_at=gte.${sinceIso}&select=started_at,duration_seconds&order=started_at.desc&limit=5000`)
    const secByDay: Record<string, number> = {}
    for (const se of sess as unknown as { started_at: string; duration_seconds?: number | null }[]) {
      const k = kstDateStr(new Date(se.started_at))
      secByDay[k] = (secByDay[k] || 0) + (se.duration_seconds || 0)
    }
    const serverAtt = Object.keys(secByDay).filter(k => secByDay[k] >= ATTENDANCE_MIN_SEC)
    const attendance = Array.from(new Set([...(s.attendance || []), ...serverAtt])).sort().slice(-14)
    // 5) 오늘 활성시간 — 서버 합이 로컬보다 크면 채택
    const serverTodaySec = secByDay[today] || 0
    if (serverTodaySec > getDailyActiveSec()) {
      try { localStorage.setItem(DAILY_KEY, JSON.stringify({ date: today, sec: serverTodaySec })) } catch { /* */ }
    }
    let balanceDays = s.balanceDays || []
    if (dailyXp.course > 0 && dailyXp.review > 0 && !balanceDays.includes(today)) balanceDays = [...balanceDays, today].slice(-60)
    const ns = { ...s, dailyXp, attendance, balanceDays }
    saveLocal(ns)
    return ns
  } catch { return s }
}
