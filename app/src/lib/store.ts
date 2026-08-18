// 전역 상태 + 로컬 우선 기록 + Supabase 비동기 동기화 큐 (오프라인 내성)
import { db, fetchLearner, countRows, type Learner } from './supabase'
import { levelForXp, XP, answerXpOf, moduleBonusOf } from './xp'
import { todayStr, kstDateStr } from './leitner'
import { isOffTrackModuleId, MODULE_ORDER, EXT_MODULE_ORDER } from './content'
// ★v1.4.40★ 출석·기기분리·집중시간 규칙은 adminMetrics 단일 원천을 **그대로 부른다**.
//   여기에 규칙을 다시 적지 않는다 — 2026-08-16 검증에서 드러난 결함이 정확히 "관제실만 고치고
//   학습자 앱은 자기 계산을 계속 쓴 것"이었다(L46·L51).
import {
  attendanceDays, streakFrom, focusSecOfTimestamps, kstDayOf,
  excludedSessionIds, learnerEvents, ATTENDANCE_RULE,
  type MetricEvent, type MetricSession,
} from './adminMetrics'
// ★v1.4.46 (C5)★ 학습자 앱 서버 쓰기의 기기 관문. 규칙은 lib/device.ts 한 곳에만 있다.
import { writesAllowed, noteBlockedWrite, isMobileUA } from './device'

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
  // ── v1.4.40 (Dio님 결정 2026-08-16) ──
  /** 지금까지의 **최고** 연속 출석. 출석 기준을 정직하게 고치면 현재 불꽃은 내려갈 수 있는데,
   *  아이가 실제로 해낸 기록까지 사라지면 안 된다. 현재값과 별개로 최댓값만 남긴다(내려가지 않는다). */
  bestStreak: number
  /** 진도(모듈 52개)에 안 잡히는 학습 문항 수 — 지령 미션·에코 사냥·문장 소환진·복습.
   *  2026-08-16 실측으로 전체의 **20.6%(911문항)** 가 여기였는데 진도바는 1도 안 움직였다.
   *  아이가 619문항을 푼 지령 미션이 "안 한 것"처럼 보이면 안 된다. (분모는 건드리지 않는다 — L46) */
  offTrack: number
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
  bestStreak: 0,
  offTrack: 0,
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
/** 큐 보관 상한. ★v1.4.40에서 500 → 3000★
 *  왜 500이 위험했나: 문항 1개가 큐 항목 **3개**를 만든다(answer_events + xp_events + learners update).
 *  즉 실질 용량이 **약 166문항**이었다. 비행기 모드로 200문항을 풀면 앞쪽 34문항의 `answer_events`가
 *  경고도 예외도 없이 사라졌다. 하루 최다 실측이 1,179문항이므로 3,000이면 여유가 있다. */
const QUEUE_CAP = 3000
/** 한 번에 보내고 한 번에 저장하는 묶음 크기. 저장(전체 직렬화) 횟수를 이 배수만큼 줄인다. */
const FLUSH_CHUNK = 25
function saveQueue(q: QueueItem[]) {
  try {
    if (q.length > QUEUE_CAP) {
      // 넘치면 **가장 오래된 것부터** 밀려난다 — 그래도 흔적은 남긴다(조용한 유실 금지).
      for (const dropped of q.slice(0, q.length - QUEUE_CAP)) {
        pushDeadLetter(dropped, `queue overflow (>${QUEUE_CAP})`)
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_CAP)))
  } catch { /* */ }
}

/** 재시도가 **정말로** 무의미한 실패인가.
 *  400 = 요청 자체가 잘못됨 / 404 = 대상 없음 / 409 = 충돌(이미 있음).
 *  401·403·408·429·5xx·네트워크 오류는 전부 재시도 대상이다. */
export function isPermanentFailure(e: unknown): boolean {
  const m = /supabase (\d{3})/.exec(String(e))
  if (!m) return false                    // 네트워크·파싱 등 — 재시도
  const code = Number(m[1])
  return code === 400 || code === 404 || code === 409
}

/* ── dead-letter: 버린 기록을 조용히 없애지 않는다 ──────────────────
   버려야만 하는 항목도 **흔적은 남긴다.** 아빠가 관제실에서 "전송 못 한 기록 N건"으로 볼 수 있어야
   "왜 그날 문항이 비었지?"를 추적할 수 있다. 사람이 눈치채지 못하는 유실이 이 프로젝트가 반복해 겪은 사고다. */
const DEAD_KEY = 'wordcraft_deadletter_v1'
const DEAD_CAP = 200
export interface DeadLetter { at: string; table: string; kind: string; error: string; payload: unknown }
export function getDeadLetters(): DeadLetter[] {
  try { return JSON.parse(localStorage.getItem(DEAD_KEY) || '[]') as DeadLetter[] } catch { return [] }
}
export function clearDeadLetters(): void {
  try { localStorage.removeItem(DEAD_KEY) } catch { /* */ }
}
function pushDeadLetter(item: { kind: string; table: string; payload: unknown }, error: string): void {
  try {
    const cur = getDeadLetters()
    cur.push({ at: new Date().toISOString(), table: item.table, kind: item.kind, error: error.slice(0, 300), payload: item.payload })
    localStorage.setItem(DEAD_KEY, JSON.stringify(cur.slice(-DEAD_CAP)))
  } catch { /* */ }
}

let flushing = false
export async function flushQueue() {
  if (flushing) return
  flushing = true
  try {
    // 한 번에 하나씩 — 매 반복마다 localStorage에서 큐를 다시 읽는다.
    // 전송 await 도중 enqueue된 항목을, 옆 메모리 스냅샷을 saveQueue로 저장하며 덮어써
    // 유실하던 레이스를 봉합(XP·배지·복습카드가 전부 사라지던 근본 원인).
    /* ★v1.4.40-b — 묶음 처리★
       예전(그리고 v1.4.40-a)에는 **항목마다** `loadQueue()`(전체 JSON.parse) + `saveQueue()`(전체 stringify +
       localStorage 동기 쓰기)를 했다. 큐 상한을 500 → 3,000으로 올리자 그 비용이 그대로 제곱이 됐다 —
       독립 감사 실측: 500건 459ms → **3,000건 18,062ms**, 누적 쓰기 1.4GB. 폰에서는 몇 배 더 느리다.
       (상한을 푸는 변경에는 "그러면 계산량은?"을 물어야 한다 — L50. 여기서만 안 물었다.)
       → 최대 FLUSH_CHUNK개를 보내고 **그 뒤에 한 번만** 저장한다. 그 사이 enqueue된 항목은
         저장 직전에 큐를 다시 읽어 보존하고, 처리한 개수만큼만 앞에서 덜어낸다. */
    while (true) {
      const batch = loadQueue().slice(0, FLUSH_CHUNK)
      if (!batch.length) break
      let processed = 0
      let stop = false
      for (const head of batch) {
      try {
        if (head.kind === 'insert') await db.insert(head.table, head.payload as Record<string, unknown>)
        else if (head.kind === 'upsert') await db.upsert(head.table, head.payload as Record<string, unknown>, head.conflict || '', head.ignore)
        else await db.update(head.table, head.query || '', head.payload as Record<string, unknown>)
      } catch (e) {
        /* ★★v1.4.40 — 여기가 학습 기록을 영구 삭제하고 있었다★★
           예전 조건: `String(e).includes('supabase 4')` → **4xx 전체**를 "재시도 무의미"로 보고 큐에서 뺐다.
           그런데 4xx에는 **재시도해야 하는 것**이 섞여 있다:
             401 토큰 만료 + 그 순간 리프레시 실패(WiFi↔LTE 전환·터널) / 403 RLS 일시 오판정
             408 타임아웃 / 429 레이트리밋
           지하철에서 60문항을 풀던 중 토큰이 만료되면 `answer_events` 60건이 15초 뒤 flush에서
           **한 건씩 조용히 사라졌다.** 로컬 XP는 이미 올라가 있어 아이 화면은 정상이고,
           관제실만 그 세션의 문항이 0건이라고 말한다. `answer_events`는 CONTRACT상 절대 삭제 금지다.
           → 진짜로 재시도가 무의미한 것(400 잘못된 요청 / 404 없음 / 409 충돌)만 버리고,
             버릴 때도 조용히 버리지 않는다(dead-letter + 관제실 노출). */
        if (!isPermanentFailure(e)) { stop = true; break } // 네트워크·401·429 등 — 유지, 다음 기회 재시도
        pushDeadLetter(head, String(e))
      }
        processed++
      }
      if (processed) {
        const q = loadQueue() // await 이후 최신 큐를 다시 읽기 (그 사이 enqueue된 항목 보존)
        q.splice(0, processed) // 방금 처리한 만큼만 앞에서 제거
        saveQueue(q)
      }
      if (stop) break
    }
  } finally { flushing = false }
}

export function enqueue(item: QueueItem) {
  /* ★★v1.4.46 (C5) — 학습자 앱의 서버 쓰기 관문★★
     아빠 PC에서 학습자 화면을 열면 아이 계정에 썼다(desktop 세션 75건 · 그중 최근 30건이 문항 0개,
     한 건은 duration 10시간 17분). 기기 역할이 '구경'이면 **큐에 넣지도 않는다** —
     큐에 넣고 안 보내면 나중에 역할이 바뀔 때 한꺼번에 나가서 더 나쁘다.
     조용히 버리지 않는다: 흔적을 세어 화면(구경 모드 띠)과 정보 탭이 사실대로 말한다(L47). */
  if (!writesAllowed()) { noteBlockedWrite(); return }
  const q = loadQueue()
  /* ★v1.4.40★ `learners` 갱신은 **절대값**(xp·level·streak)을 싣는다 = 마지막 하나만 보내면 된다.
     그런데 문항마다 한 건씩 쌓여 큐 용량의 1/3을 완전한 중복으로 태우고 있었다.
     아직 못 보낸 같은 대상의 갱신이 있으면 새 값으로 덮어쓴다(전송 횟수·용량 동시 절감). */
  //   ★단, flush가 도는 중에는 병합하지 않는다★ — 전송 중인 맨 앞 항목에 병합하면
  //   전송이 끝난 뒤 `q.shift()`가 **방금 병합한 새 값까지 버린다**(독립 감사 2026-08-16 실행 증명).
  if (!flushing && item.kind === 'update' && item.table === 'learners') {
    const i = q.findIndex(x => x.kind === 'update' && x.table === 'learners' && x.query === item.query)
    if (i >= 0) {
      q[i] = { ...q[i], payload: { ...(q[i].payload as Record<string, unknown>), ...(item.payload as Record<string, unknown>) } }
      saveQueue(q)
      void flushQueue()
      return
    }
  }
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
  // 문항을 푼 것은 가장 확실한 '사용 중' 신호다 — 학습 시간 게이트를 여기서도 연다(v1.4.35)
  markUserActivity()
  // ★v1.4.40★ 출석 판정의 **증거**를 로컬에도 남긴다. 오프라인에서도 문항 간격으로
  //   집중 시간을 계산할 수 있어야 하고, 서버 세션 시간에 의존하지 않기 위해서다.
  pushTodayAnswerTs(Date.now())
  // 진도 밖 학습(지령 미션·에코 사냥·소환진·복습)도 '한 것'으로 센다 — 진도바가 안 움직여도 공부는 공부다.
  if (isOffTrackModuleId(p.module_id)) bumpOffTrack(s)
  // 응답시간 상한 120초 절사 (A-019 — 탭 이탈 등 비정상 값이 통계를 오염시키지 않도록)
  const clamped = { ...p, response_ms: p.response_ms != null ? Math.min(p.response_ms, 120000) : undefined }
  /* ★v1.4.40-b — `created_at`을 **클라이언트 시각으로 보낸다**★
     예전에는 payload에 없어 서버 DEFAULT `now()`가 찍혔다. 그래서 지하철에서 푼 60문항이
     온라인 복귀 시 **한꺼번에 같은 시각으로** 기록됐고, 문항 간격으로 집중시간을 계산하는
     출석 판정(attendanceDays)에서 그 날은 "2분 공부"로 뭉개져 **영원히 출석이 아니었다.**
     (독립 감사 2026-08-16 지적 — 출석 재계산이 오프라인 학습을 삼키는 근본 원인) */
  enqueue({ kind: 'insert', table: 'answer_events', payload: { learner_id: s.learnerId, session_id: s.sessionId, created_at: new Date().toISOString(), ...clamped } })
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
/** 진도 밖 학습 1건 — recordAnswer가 부른다. React 상태와 경합하지 않도록 localStorage만 갱신한다. */
function bumpOffTrack(s: LocalState): void {
  try {
    const cur = loadLocal()
    saveLocal({ ...cur, offTrack: (cur.offTrack || 0) + 1 })
  } catch { /* */ }
  void s
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

/* ★★v1.4.35 — 2026-08-15 적대적 검증에서 드러난 두 결함을 여기서 막는다★★
 *
 *  ① **입력이 없어도 시간이 쌓였다.** 아래 delta 게이트는 "2분 이상 멈춤"만 걸렀지
 *     "사람이 아무것도 안 함"은 거르지 않았다. 그래서 화면을 켜 두기만 해도 30초마다 학습 시간이
 *     쌓였고, 8/15에는 **푼 문항 0개인 날에 세션 합계 42,216초(11시간 43분)** 가 기록됐다.
 *     그 시간은 관제실 "오늘 학습"과 **출석 15분 판정·연속 출석**까지 그대로 밀고 들어갔다.
 *     → 이제 마지막 사용자 입력으로부터 IDLE_TIMEOUT_MS 안일 때만 시간을 센다.
 *
 *  ② **탭을 두 개 열면 세션이 섞였다.** tick이 `loadLocal().sessionId`(=localStorage 공유값)를 봤기 때문에,
 *     나중에 연 탭이 그 값을 덮어쓰면 먼저 열린 탭이 **남의 세션에 자기 누적치**를 썼다.
 *     실측: 세션 #242는 실경과 69초인데 1,150초로 저장돼 있다(duration > 벽시계).
 *     → 이제 각 탭은 자기가 만든 세션 id(_ownedSessionId)에만 쓴다.
 *
 *  ③ 안전망: 누적 시간은 **자기 세션의 벽시계와 3시간**을 넘을 수 없다.
 */
export const IDLE_TIMEOUT_MS = 90_000        // 마지막 입력 후 90초까지는 '공부 중'으로 본다(문제 읽는 시간)
export const SESSION_CAP_MS = 3 * 3600_000   // 한 세션 상한 3시간 — 그 이상은 사람이 앉아 있던 시간이 아니다
let _ownedSessionId: number | null = null    // 이 탭이 만든 세션. 다른 탭 것에는 절대 쓰지 않는다
let _ownedStart = 0
let _lastActivity = 0                        // 마지막 사용자 입력 시각
let _activityBound = false

/** 사용자가 실제로 뭔가 했다 — 화면 어디든 누르거나 키를 치면 갱신된다.
 *  문항 제출(recordAnswer)에서도 부른다: 자동 재생 문항처럼 탭 없이 넘어가는 경우가 있기 때문. */
export function markUserActivity(): void { _lastActivity = Date.now() }

function bindActivityListeners(): void {
  if (_activityBound || typeof window === 'undefined') return
  _activityBound = true
  const opt = { passive: true, capture: true } as const
  for (const ev of ['pointerdown', 'keydown', 'touchstart', 'wheel']) {
    window.addEventListener(ev, markUserActivity, opt)
  }
}

export async function startSession(s: LocalState): Promise<LocalState> {
  const start = Date.now()
  let sessionId: number | null = null
  /* ★v1.4.46 (C5)★ 구경 모드(데스크탑 기본)에서는 세션 자체를 만들지 않는다.
     이 INSERT 한 줄이 C5의 실제 오염원이었다 — 화면을 열기만 해도 아이 지표에 세션이 생겼다.
     세션이 없으면 `tickSession`이 `_ownedSessionId` 없음으로 즉시 반환하므로 하트비트 UPDATE도 나가지 않는다. */
  if (writesAllowed()) {
    try {
      const rows = await db.insert('sessions', { learner_id: s.learnerId, device: isMobileUA() ? 'mobile' : 'desktop' })
      sessionId = (rows[0] as { id?: number })?.id ?? null
    } catch { /* 오프라인 — 세션 없이 진행, answer_events는 session_id null */ }
  } else {
    noteBlockedWrite()
  }
  _activeMs = 0
  _lastTick = start
  _ownedSessionId = sessionId
  _ownedStart = start
  _lastActivity = start // 앱을 연 것 자체가 입력이다 — 첫 구간은 세어 준다
  bindActivityListeners()
  const ns = { ...s, sessionId, sessionStart: start }
  saveLocal(ns)
  return ns
}

// 활성 시간 누적 후 서버 duration 반영. end=true면 종료 확정(ended_at + 신뢰 큐 전송).
// 반환: 이번 틱에서 출석이 새로 인정됐으면 갱신된 상태(LocalState), 아니면 null (App이 화면에 반영)
function tickSession(end: boolean, queued = false): LocalState | null {
  const s = loadLocal()
  // ★이 탭이 만든 세션에만 쓴다★ — localStorage의 sessionId를 보면 다른 탭 세션에 덮어쓴다(v1.4.35 봉합)
  const sid = _ownedSessionId
  if (!sid) return null
  const now = Date.now()
  const delta = now - _lastTick
  _lastTick = now
  let attended: LocalState | null = null
  // 누적 조건 3가지를 **전부** 만족해야 학습 시간이다:
  //   ① 정상 경과(0~2분) — 그 이상은 백그라운드/절전으로 얼어붙은 것
  //   ② 마지막 입력 후 90초 이내 — 켜 두기만 한 시간은 학습이 아니다 (v1.4.35 핵심 수정)
  //   ③ 화면이 보이는 중 — 숨은 탭은 애초에 공부가 아니다
  const interacted = now - _lastActivity < IDLE_TIMEOUT_MS
  const visible = typeof document === 'undefined' || !document.hidden
  if (delta > 0 && delta < 120000 && interacted && visible) {
    _activeMs += delta
    addDailyActiveSec(Math.round(delta / 1000)) // '앱을 조작한 시간' — 참고값. 출석 판정에는 쓰지 않는다.
  }
  // ★v1.4.40 출석 판정★ — 누적 '조작 시간'이 아니라 **문항 기록**으로 판정한다.
  //   예전에는 `addDailyActiveSec(...) >= 15분`이었고, 그 분모(DAILY_KEY)를 syncSharedDaily가
  //   서버 세션 원본 합으로 덮어써서 **30초 만에 출석이 찍힐 수 있었다**(2026-08-16 검증).
  //   이제 규칙은 adminMetrics.ATTENDANCE_RULE 하나뿐이고, 관제실도 같은 것을 본다.
  if (!(s.attendance || []).includes(todayStr()) && todayAttendanceEarned()) {
    attended = markAttendance(s)
  }
  // 안전망 — 누적치는 자기 세션의 벽시계와 3시간 상한을 절대 넘지 않는다.
  const wallMs = Math.max(0, now - (_ownedStart || now))
  const dur = Math.round(Math.min(_activeMs, wallMs, SESSION_CAP_MS) / 1000)
  if (dur <= 0 && !end) return attended
  const payload: Record<string, unknown> = { duration_seconds: dur }
  if (end) {
    payload.ended_at = new Date().toISOString()
    enqueue({ kind: 'update', table: 'sessions', query: `id=eq.${sid}`, payload }) // 오프라인 내성
  } else if (queued) {
    // v1.4.40-b — 백그라운드 전환·화면 이동은 세션당 몇 번뿐이다. 이 지점만 큐를 태워
    //   오프라인에서 학습한 시간이 통째로 사라지지 않게 한다(하트비트는 그대로 best-effort).
    enqueue({ kind: 'update', table: 'sessions', query: `id=eq.${sid}`, payload })
  } else {
    db.update('sessions', `id=eq.${sid}`, payload).catch(() => {}) // 하트비트 — best-effort
  }
  return attended
}

// 30초 주기 하트비트(App의 setInterval에서 호출) — 출석이 새로 인정되면 갱신 상태 반환
export function heartbeatSession(): LocalState | null { return tickSession(false) }
/** ★v1.4.40★ 백그라운드 전환·화면 이동 — 지금까지를 **저장만** 한다(세션을 닫지 않는다).
 *
 *  왜 분리했나: 예전에는 `visibilitychange`(hidden)에서도 `endSession()`을 불러 `ended_at`을 확정했다.
 *  그런데 복귀하면 `resumeSession()`이 새 세션을 만들지 않고 **같은 세션에 계속 시간을 쓴다.**
 *  그러면 관제실에서:
 *    ① `credibleSessionSec = min(raw, wall)`이 전환 시점까지로 깎아 **복귀 후 학습이 통째로 증발**하고
 *    ② `isSessionCorrupt`가 true가 되어 "세션 기록이 깨져 있어요 (P0)"를 **오경보**한다
 *       (원인을 '다중 탭'이라고 설명하는데 실제로는 정상적인 앱 전환이다).
 *  모바일에서 앱 전환은 세션마다 일어난다 — 거의 모든 세션이 이 상태였을 수 있다.
 *  → 이제 hidden에서는 저장만 하고, 진짜 종료(pagehide)에서만 닫는다. */
export function pauseSession() { void tickSession(false, true) }
// 페이지 종료 — 사용시간 확정 기록(ended_at)
export function endSession() { void tickSession(true) }
// 포그라운드 복귀 — 그 사이 얼어붙은 시간은 학습 아님, 구간만 리셋(누적 제외)
export function resumeSession() { _lastTick = Date.now(); markUserActivity() }

// ---------- 출석 & 스트릭 (2026-07-16 규칙: 하루 15분 이상 학습해야 출석 인정 — Dio님 지시) ----------
/** 출석 인정 시간 — ★숫자는 adminMetrics.ATTENDANCE_RULE 하나뿐★. 여기서 다시 적지 않는다(L27). */
export const ATTENDANCE_MIN_SEC = ATTENDANCE_RULE.needFocusSec

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

/* ── ★v1.4.40★ 오늘 문항 시각 로그 — 출석 판정의 '증거' ──────────────────
   왜 필요한가: 출석은 이제 `sessions.duration_seconds`가 아니라 **문항 간격**으로 판정한다.
   서버가 그 계산을 해 주지만(syncSharedDaily), 지하철·비행기 모드에서도 판정이 돼야 하므로
   같은 계산을 로컬 증거로도 할 수 있어야 한다. 산식은 adminMetrics.focusSecOfTimestamps 하나뿐이다. */
const DAILY_ANS_KEY = 'wordcraft_daily_answers_v1'
/** 하루치 문항 시각 보관 상한 — 하루 최다 실측이 1,179문항이라 3,000이면 충분히 여유롭다. */
const DAILY_ANS_CAP = 3000

function loadTodayAnswerTs(): number[] {
  try {
    const d = JSON.parse(localStorage.getItem(DAILY_ANS_KEY) || 'null') as { date: string; ts: number[] } | null
    return d && d.date === todayStr() && Array.isArray(d.ts) ? d.ts : []
  } catch { return [] }
}
function pushTodayAnswerTs(t: number): void {
  try {
    const ts = loadTodayAnswerTs()
    ts.push(t)
    localStorage.setItem(DAILY_ANS_KEY, JSON.stringify({ date: todayStr(), ts: ts.slice(-DAILY_ANS_CAP) }))
  } catch { /* 저장 실패해도 학습은 계속된다 — 서버 계산이 백업이다 */ }
}
/** 오늘 문항 기록으로 계산한 집중 시간(초). 관제실의 '실제로 문제를 푼 시간'과 같은 산식. */
export function todayFocusSec(): number {
  return focusSecOfTimestamps(loadTodayAnswerTs().slice().sort((a, b) => a - b))
}
/** 오늘 출석 조건을 채웠는가 — ①문항 있음 ②집중 15분 이상. (기기 분리는 이 기기가 곧 아이 기기라 자명) */
export function todayAttendanceEarned(): boolean {
  const ts = loadTodayAnswerTs()
  return ts.length >= ATTENDANCE_RULE.needAnswers && todayFocusSec() >= ATTENDANCE_RULE.needFocusSec
}

/** 출석 배열에 오늘을 넣고 **연속 일수를 배열에서 다시 계산**한다.
 *  예전에는 `last_active_date === 어제 ? streak+1 : 1`이라 서버 값 하나에 기대고 있었고,
 *  그 값이 거짓 출석 위에 서 있으면 영원히 되돌릴 수 없었다. 이제 근거는 배열이다. */
export function markAttendance(s: LocalState): LocalState {
  const today = todayStr()
  if ((s.attendance || []).includes(today)) return s
  const attendance = Array.from(new Set([...(s.attendance || []), today])).sort().slice(-STREAK_WINDOW_DAYS)
  const streak = Math.max(streakFrom(attendance, today), 1)
  const ns = {
    ...s, streak_days: streak, last_active_date: today, attendance,
    bestStreak: Math.max(s.bestStreak || 0, s.streak_days || 0, streak),
  }
  enqueue({ kind: 'update', table: 'learners', query: `id=eq.${ns.learnerId}`, payload: { streak_days: streak, last_active_date: today } })
  saveLocal(ns)
  return ns
}

/** 출석 이력을 보관하는 창(일). 14일이면 2주 연속까지만 셀 수 있어 30일 뱃지가 영영 안 뜬다 — 40일로 늘린다.
 *  ★그러면 계산량은?(L50)★ 창을 14→40일로 늘리면 syncSharedDaily가 받는 문항이 늘어난다.
 *  실측 기준 최근 40일 문항은 4,432건(전 이력)이고, 집계는 하루 한 번 O(n log n)이라 수십 ms다. */
export const STREAK_WINDOW_DAYS = 40

/** 스트릭 정정 안내를 아이에게 한 번만 보여주기 위한 플래그 (숫자가 내려간 경우에만 세팅) */
export const STREAK_FIX_KEY = 'wordcraft_streak_fix_v1'
export interface StreakFixNotice { from: number; to: number; at: string }
export function takeStreakFixNotice(): StreakFixNotice | null {
  try {
    const raw = localStorage.getItem(STREAK_FIX_KEY)
    if (!raw) return null
    localStorage.removeItem(STREAK_FIX_KEY) // 한 번만 보여준다
    return JSON.parse(raw) as StreakFixNotice
  } catch { return null }
}
function setStreakFixNotice(from: number, to: number): void {
  try { localStorage.setItem(STREAK_FIX_KEY, JSON.stringify({ from, to, at: todayStr() })) } catch { /* */ }
}

/** ★v1.4.40★ 출석 배열로 연속 일수를 다시 계산한다 — **내려가는 것도 허용한다.**
 *
 *  예전 이름은 `repairStreak`이었고 "올라가는 경우만" 고쳤다. 그래서 거짓 출석으로 부풀려진 값은
 *  한 번 올라가면 절대 안 내려왔다. 2026-08-16 Dio님 결정: **정직하게 재계산하고, 내려가면 아이에게 알린다.**
 *  (숫자를 몰래 깎지 않는다 — 아이가 스스로 이해할 수 있게 말해 준다.) */
export function repairStreak(s: LocalState, trusted = false): LocalState {
  const att = (s.attendance || []).slice().sort()
  const today = todayStr()
  const run = streakFrom(att, today)
  /* ★v1.4.40-b — 내리는 것은 위험한 방향이다★
     독립 감사 실행 증명: `syncSharedDaily`가 조회 실패를 조용히 삼키면 `attendance=[]`인 채로 돌아오고,
     그 상태에서 이 함수가 **서버 streak을 0으로 덮어썼다.** 새 기기·터널·5xx에서 바로 재현되고,
     예한이는 "4일 → 0일로 바뀌었어"라는 **거짓 안내**까지 봤다. 온·오프라인을 오가면 4↔0 진동.
     → 올리는 것은 언제나 안전하니 그대로 두고, **내리는 것은 재계산을 믿을 수 있을 때만** 한다. */
  if (run < s.streak_days && !trusted) {
    const bs = Math.max(s.bestStreak || 0, s.streak_days || 0)
    if (bs === s.bestStreak) return s
    const keep = { ...s, bestStreak: bs }
    saveLocal(keep)
    return keep
  }
  // ★최고 기록은 무슨 일이 있어도 내려가지 않는다★ — 현재 불꽃을 정직하게 깎기 **전에** 먼저 남긴다.
  const bestStreak = Math.max(s.bestStreak || 0, s.streak_days || 0, run)
  if (run === s.streak_days) return bestStreak === s.bestStreak ? s : (() => { const n = { ...s, bestStreak }; saveLocal(n); return n })()
  if (run < s.streak_days) setStreakFixNotice(s.streak_days, run)
  const ns = { ...s, streak_days: run, bestStreak }
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
    // ★v1.4.40★ selectAll — 어휘 팩 200개 + 골렘 40개 + 모듈 52개 + 진단이라 1,000행이 먼 이야기가 아니다.
    const pr = await db.selectAll('module_progress', `learner_id=eq.${learner.id}&order=module_id.asc`)
    const progress: Record<string, ProgressEntry> = { ...s.progress }
    for (const r of pr.rows as unknown as (ProgressEntry & { learner_id: string; completed_at?: string | null })[]) {
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
      offTrack: s.offTrack || 0,
      // ★v1.4.40★ 최고 기록 씨앗 — 재계산으로 현재 불꽃이 깎이기 **전에** 서버 값을 먼저 담는다.
      //   (기기를 바꿔도, 로컬이 비어 있어도 아이가 실제로 세운 기록이 사라지지 않는다)
      bestStreak: Math.max(s.bestStreak || 0, s.streak_days || 0, learner.streak_days || 0),
      last_active_date: s.last_active_date || learner.last_active_date,
      progress,
      diagDone,
    }
    saveLocal(ns)
    /* ★v1.4.40★ 진도 밖 학습 씨앗 — 이미 쌓인 것(실측 911문항)을 0부터 세면 아이가 손해다.
       행을 받지 않고 **개수만** 센다. 실패하면 그냥 로컬 카운터로 살아간다(막지 않는다). */
    if (!ns.offTrack) {
      void countRows('answer_events', offTrackCountQuery(ns.learnerId!)).then(n => {
        if (n && n > 0) { const cur = loadLocal(); saveLocal({ ...cur, offTrack: Math.max(cur.offTrack || 0, n) }) }
      })
    }
    return ns
  } catch {
    return s // 오프라인 — 로컬 상태로 진행
  }
}

/** 진도 밖 학습 개수 조회식 — 판정 규칙은 content.isOffTrackModuleId와 같은 뜻이어야 한다. */
function offTrackCountQuery(learnerId: string): string {
  return `learner_id=eq.${learnerId}`
    + `&module_id=not.in.(${[...MODULE_ORDER, ...EXT_MODULE_ORDER].join(',')})`
    + '&module_id=not.like.DIAG-*&module_id=not.like.V*-*&module_id=not.like.GOLEM-*'
    + '&activity_type=neq.diagnostic&select=id'
}


/** v1.4.3 공유 밸런스 — 서버(answer_events·module_progress·sessions)에서 오늘 밸런스·주간 출석·오늘 활성시간을
 *  관제실 xpOf와 1:1 산식으로 파생해 로컬과 병합(항목별 max/합집합 — L17 additive). 기기 교체·새 기기에도 게이지 정확. */
// ★L12·L27★ 산식을 여기에 다시 쓰지 않는다. xp.ts의 단일 정의만 부른다.
//   (v1.4.17에서 이 파일에 복사해 둔 어휘 산식이 v1.4.18 소스 복구 때 유실돼 관제실이 51% 부풀었다.)
const xpOfEvent = answerXpOf

export interface DailySync {
  s: LocalState
  /** 서버 조회가 **실제로 성공했는가**. 실패했으면 attendance가 비어 보일 뿐이지 정말 비어 있는 게 아니다. */
  ok: boolean
  /** 실제로 받아 본 문항 수. 0이면(RLS·권한 문제 등) 판정 근거가 없다는 뜻이다. */
  eventsSeen: number
}
export async function syncSharedDaily(s: LocalState): Promise<DailySync> {
  if (!s.learnerId) return { s, ok: false, eventsSeen: 0 }
  try {
    const today = todayStr()
    const sinceIso = new Date(Date.now() - STREAK_WINDOW_DAYS * 86400000).toISOString()

    // ★L49★ `db.select`가 아니라 `db.selectAll`. 서버 `Max rows` 기본값이 1,000이라
    //   `limit=2000/5000`을 적어도 조용히 잘린다 — 예한이 문항은 이미 4,432건이다.
    //   ★그러면 계산량은?(L50)★ 창은 40일, 실측 전 이력이 4,432건이고 아래 집계는 전부 O(n log n)
    //   한 번씩이다(하루 한 번, 앱 시작 시). 컨테이너 실측 수십 ms.
    const [evRes, seRes, prRes] = await Promise.all([
      db.selectAll('answer_events',
        `learner_id=eq.${s.learnerId}&created_at=gte.${sinceIso}`
        + '&select=session_id,activity_type,is_correct,created_at,module_id&order=created_at.asc'),
      db.selectAll('sessions',
        `learner_id=eq.${s.learnerId}&started_at=gte.${sinceIso}`
        + '&select=id,started_at,ended_at,duration_seconds,device&order=started_at.asc'),
      db.selectAll('module_progress',
        `learner_id=eq.${s.learnerId}`
        + '&select=module_id,status,best_score,completed_at,updated_at,mastered_at&order=module_id.asc'),
    ])
    const sessions = seRes.rows as unknown as MetricSession[]
    // ★v1.4.40★ 아빠 PC(desktop)에서 나온 문항은 아이 지표가 아니다 — 실측 85건이 섞여 있었다.
    const events = learnerEvents(evRes.rows as unknown as MetricEvent[], excludedSessionIds(sessions))

    // 1) 오늘 밸런스 — 모험(course)/복습(review) XP
    let course = 0, review = 0, reviewCorrectToday = 0
    for (const e of events) {
      if (kstDayOf(e.created_at) !== today) continue
      const x = xpOfEvent(e.activity_type, e.is_correct)
      if (e.activity_type === 'review') { review += x; if (e.is_correct) reviewCorrectToday++ }
      else course += x
    }
    review += Math.floor(reviewCorrectToday / XP.reviewComboEvery) * XP.reviewCombo
    // 2) module_progress → 오늘 완료/진단/유령 보너스 (course)
    for (const p of prRes.rows as unknown as { module_id: string; status: string; best_score?: number | null; completed_at?: string | null; updated_at?: string | null; mastered_at?: string | null }[]) {
      if (p.status === 'completed' || p.status === 'mastered') {
        const k = kstDateStr(new Date(p.completed_at || p.updated_at || Date.now()))
        if (k === today) course += moduleBonusOf(p.module_id, p.best_score)  // ★단일 정의(xp.ts)★
      }
      if (p.mastered_at && kstDateStr(new Date(p.mastered_at)) === today) course += XP.ghostClear
    }
    // 3) 오늘 밸런스 병합. 둘 다 **문항 기록에서 나온 값**이고(세션 시간이 아니다),
    //    로컬은 아직 서버에 안 올라간 꼬리를 갖고 있어 더 클 수 있다 — 그래서 항목별 max가 맞다.
    const prevDaily = s.dailyXp?.date === today ? s.dailyXp : { date: today, course: 0, review: 0 }
    const dailyXp = { date: today, course: Math.max(prevDaily.course, course), review: Math.max(prevDaily.review, review) }

    /* 4) ★출석 재계산 (Dio님 결정 2026-08-16)★
       예전: `sessions.duration_seconds` 원본 합 ≥ 15분 → 출석. 그래서 **문항 0개인 7/24가 출석일**이었고
             아빠 PC로 켜 둔 시간이 아이 출석이 됐다.
       지금: adminMetrics.attendanceDays — ①문항 있음 ②아이 기기 ③문항 간격 집중 15분 이상.
       ★합집합이 아니라 교체다★ 낡은 로컬 배열을 남겨 두면 거짓 출석이 영원히 되살아난다.
       단, 아직 서버에 안 올라간 **오늘**의 로컬 증거는 더한다(오프라인 학습을 잃지 않도록). */
    const serverAtt = attendanceDays(events, sessions)
    /* ★v1.4.40-b — 교체하되, **서버가 모르는 날은 지우지 않는다**★
       독립 감사 지적: 교체는 거짓 출석을 지우는 데는 맞지만, **아직 동기화되지 않은 오프라인 학습일**까지
       같이 지운다. 둘을 구분하는 기준은 "서버가 그 날에 대해 무언가를 알고 있는가"다.
         · 거짓 출석일(예: 2026-07-24)은 세션이 8건 있고 문항이 0건이다 → 서버가 안다 → 지운다.
         · 오프라인 학습일은 세션도 문항도 아직 안 올라갔다 → 서버가 모른다 → 로컬을 믿고 남긴다.
       (문항이 flush되면 `created_at`을 클라이언트 시각으로 보내므로 그때 정식으로 인정된다.) */
    const knownDays = new Set<string>()
    for (const e of evRes.rows as unknown as MetricEvent[]) knownDays.add(kstDayOf(e.created_at))
    for (const se of sessions) knownDays.add(kstDayOf(se.started_at))
    const unsyncedLocal = (s.attendance || []).filter(d => !knownDays.has(d))
    const attendance = Array.from(new Set([
      ...serverAtt,
      ...unsyncedLocal,
      ...(todayAttendanceEarned() ? [today] : []),
    ])).sort().slice(-STREAK_WINDOW_DAYS)

    let balanceDays = s.balanceDays || []
    if (dailyXp.course > 0 && dailyXp.review > 0 && !balanceDays.includes(today)) balanceDays = [...balanceDays, today].slice(-60)
    const ns = { ...s, dailyXp, attendance, balanceDays, last_active_date: attendance[attendance.length - 1] ?? s.last_active_date }
    saveLocal(ns)
    return { s: ns, ok: true, eventsSeen: events.length }
  } catch { return { s, ok: false, eventsSeen: 0 } }
}
