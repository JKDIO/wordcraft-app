/** 오늘 채점 횟수의 **서버 측 회계** — L61 근본 해결 (v1.4.46 신설)
 *
 * ═══ 왜 필요한가 (GPT 교차 감사 이월 7건이 전부 이 계열이다) ═══════════════════
 * v1.4.43에서 하루 상한(60장)의 분모가 `localStorage`의 `gradedToday()`가 됐다.
 * 저장소는 그대로인데 **역할이 승격됐다** — 예전엔 "같은 카드 재채굴 방지"(실패해도 서버 `due_date`가
 * 막아 줬다)였고, 지금은 **"아이가 오늘 몇 장까지 하느냐"를 정하는 유일한 근거**다.
 * 감사가 지적한 7건:
 *   ① 저장 실패(사생활 모드·쿼터 초과)를 `catch {}`로 삼켜 **카운터가 영원히 0** → 상한 무력화
 *   ② 두 탭이 각각 목록을 열면 **상한이 두 배**
 *   ③ `읽기 → +1 → 저장`이 원자적이지 않아 동시 채점이 1회로 집계
 *   ④⑤⑥ 기기 교체·브라우저 프로필 변경·**기기 날짜 변경**으로 일일 제한이 새로 생김
 *   ⑦ 그래서 상한이 "약속"이 아니라 "권고"였다
 *
 * ═══ 어떻게 고쳤나 ═══════════════════════════════════════════════════════
 * 하루 회계를 **서버의 원자적 카운터**로 옮기고, 로컬은 "빠른 UX 보조"로 강등한다(L61 규칙 3).
 *
 *   · 서버: `review_daily(learner_id, day, graded_count)` + `wc_review_grade(learner, delta)`
 *     - `insert … on conflict do update set graded_count = graded_count + excluded.graded_count returning`
 *       → **한 문장 안에서 원자적**이다. 탭이 몇 개든 합계가 맞는다(②③ 해소).
 *     - `day`는 **서버가** `(now() at time zone 'Asia/Seoul')::date`로 정한다.
 *       기기 시계를 바꿔도 서버의 하루는 안 바뀐다(⑥ 해소).
 *     - 계정 단위라 기기·프로필을 바꿔도 이어진다(④⑤ 해소).
 *   · 클라이언트: `gradedToday() = max(로컬, 서버가 마지막으로 알려준 값)`
 *     - 로컬 저장이 죽어도 **메모리 카운터 + 서버 값**이 남아 0으로 리셋되지 않는다(① 해소).
 *     - 저장 실패는 삼키지 않고 **흔적을 남긴다**(L61 규칙 4 · L47) — 정보 탭이 사실대로 말한다.
 *   · 오프라인: 서버 호출이 실패하면 로컬만으로 계속하고, **아직 못 보낸 증분(delta)** 을 기억했다가
 *     다음 기회에 한 번에 보낸다. 상한이 오프라인에서 느슨해질 수는 있어도 **학습이 멈추지는 않는다.**
 *
 * ═══ 이 파일이 하지 않는 것 (정직) ═══════════════════════════════════════
 * 오프라인 구간에서는 여전히 클라이언트가 유일한 근거다. 비행기 모드로 하루 종일 쓰면 상한을 넘길 수 있다.
 * 그것까지 막으려면 채점 자체를 서버 왕복으로 만들어야 하는데, 지하철에서도 되는 앱이라는 성질을 잃는다.
 * **여기서 멈춘 이유를 적어 둔다 — 나중에 "왜 완전하지 않지?"라고 묻는 사람에게.**
 */
import { rpc } from './supabase'
import { todayStr } from './leitner'
import { writesAllowed } from './device'

export const GRADED_KEY = 'wordcraft_review_graded_v1'
export const SERVER_KEY = 'wordcraft_review_server_v1'
/** 로컬 저장이 실제로 실패한 적이 있는가 — 조용한 실패 금지(L47). */
export const STORAGE_FAIL_KEY = 'wordcraft_storage_fail_v1'

interface LocalLedger { date: string; n: number; sent: number }

// 메모리 사본 — localStorage가 죽어 있어도 이 세션 동안은 정확히 센다(감사 지적 ①).
let mem: LocalLedger = { date: todayStr(), n: 0, sent: 0 }
let memLoaded = false
let serverMem: { date: string; n: number } = { date: todayStr(), n: 0 }
let storageFailed = false

function readLocal(): LocalLedger {
  const today = todayStr()
  if (!memLoaded) {
    memLoaded = true
    try {
      const raw = JSON.parse(localStorage.getItem(GRADED_KEY) || 'null') as Partial<LocalLedger> | null
      if (raw && raw.date === today) {
        const n = Math.max(0, Number(raw.n) || 0)
        // ★하위호환★ v1.4.43~45의 값에는 `sent`가 없다. 그때 센 것은 서버가 모르지만,
        //   여기서 delta로 밀면 **오늘 것을 두 번 세는** 위험이 있다. 안전한 쪽(이미 반영된 것으로 간주)을 택한다.
        mem = { date: today, n, sent: raw.sent === undefined ? n : Math.max(0, Number(raw.sent) || 0) }
      } else {
        mem = { date: today, n: 0, sent: 0 }
      }
    } catch { mem = { date: today, n: 0, sent: 0 } }
    try {
      const sv = JSON.parse(localStorage.getItem(SERVER_KEY) || 'null') as { date: string; n: number } | null
      if (sv && sv.date === today) serverMem = { date: today, n: Math.max(0, Number(sv.n) || 0) }
    } catch { /* 서버 캐시는 없어도 된다 */ }
    try { storageFailed = localStorage.getItem(STORAGE_FAIL_KEY) === '1' } catch { /* */ }
  }
  if (mem.date !== today) mem = { date: today, n: 0, sent: 0 }
  if (serverMem.date !== today) serverMem = { date: today, n: 0 }
  return mem
}

function writeLocal(): void {
  try {
    localStorage.setItem(GRADED_KEY, JSON.stringify(mem))
  } catch {
    // ★삼키지 않는다★ 저장이 안 되는 기기라는 사실 자체가 화면에 보여야 한다(L47·L61 규칙 4).
    storageFailed = true
    try { localStorage.setItem(STORAGE_FAIL_KEY, '1') } catch { /* 그것도 안 되면 메모리 플래그만 */ }
  }
}

/** 로컬 저장이 실패한 기기인가 — 정보 탭·관제실이 사실대로 말할 근거. */
export function storageBroken(): boolean { readLocal(); return storageFailed }

/** ★상한의 분모★ — 로컬과 서버 중 **큰 값**. 둘 중 하나가 죽어도 상한이 사라지지 않는다. */
export function gradedToday(): number {
  const l = readLocal()
  return Math.max(l.n, serverMem.n)
}

/** 아직 서버가 모르는 증분. 오프라인에서 쌓였다가 한 번에 나간다. */
export function pendingDelta(): number {
  const l = readLocal()
  return Math.max(0, l.n - l.sent)
}

let learnerId: string | null = null
/** 앱 시작·광산 진입에서 한 번 알려 준다. 없으면 서버 회계는 쉬고 로컬만 쓴다. */
export function setLedgerLearner(id: string | null): void { learnerId = id || null }

let inFlight: Promise<void> | null = null

/**
 * 밀린 증분을 보내고 서버의 권위값을 받아온다.
 * 실패해도 던지지 않는다 — 복습은 서버가 죽어도 계속돼야 한다.
 */
export function syncDailyLedger(): Promise<void> {
  if (inFlight) return inFlight
  const l = readLocal()
  const delta = Math.max(0, l.n - l.sent)
  // 구경 모드(C5)에서는 서버에 아무것도 쓰지 않는다 — 아빠 PC가 아이 상한을 소모하면 안 된다.
  if (!learnerId || !writesAllowed()) return Promise.resolve()
  const snapshot = l.n
  inFlight = (async () => {
    try {
      const r = await rpc('wc_review_grade', { p_learner_id: learnerId, p_delta: delta })
      const n = Number((r as { graded_count?: number } | null)?.graded_count)
      if (Number.isFinite(n)) {
        serverMem = { date: todayStr(), n: Math.max(0, n) }
        try { localStorage.setItem(SERVER_KEY, JSON.stringify(serverMem)) } catch { /* */ }
        // 보낸 만큼만 sent를 올린다 — 보내는 사이에 늘어난 증분은 다음 호출이 가져간다.
        mem.sent = Math.max(mem.sent, snapshot)
        writeLocal()
      }
    } catch { /* 오프라인·서버 오류 — 로컬만으로 계속한다. 증분은 그대로 남아 다음에 나간다. */ }
  })().finally(() => { inFlight = null })
  return inFlight
}

/** 채점 1회 — 로컬을 즉시 올리고(화면 반응), 서버에는 뒤이어 보낸다. */
export function addGradedToday(): void {
  const l = readLocal()
  mem = { ...l, n: l.n + 1 }
  writeLocal()
  void syncDailyLedger()
}

/** 검사·하네스 전용 — 메모리 상태 초기화. */
export function _resetLedger(): void {
  memLoaded = false
  mem = { date: todayStr(), n: 0, sent: 0 }
  serverMem = { date: todayStr(), n: 0 }
  storageFailed = false
  learnerId = null
}
