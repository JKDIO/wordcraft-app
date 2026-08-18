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
 * ═══ ★2026-08-18 GPT 교차 감사(job 26)가 잡은 것 — 그 자리에서 봉합했다★ ═════════
 *   감사가 치명 5건을 지적했고 전부 실재였다. 클라이언트 쪽 3건을 여기서 고친다:
 *   ① **학습자 전환 오염** — `setLedgerLearner`가 id만 바꾸고 메모리·저장소 키를 그대로 뒀다.
 *      한 브라우저에서 A → B로 바꾸면 B가 A의 카운터를 이어받았다. 이 앱은 이제 아이가 셋이다.
 *      → 저장소 키를 **학습자별로 분리**하고, id가 바뀌면 메모리를 초기화한다.
 *   ② **재시도 중복 계상** — RPC는 서버에서 성공했는데 응답이 유실되면 같은 증분을 또 보냈다.
 *      두 탭이 같은 localStorage 값을 읽고 각각 보내는 경우도 같다.
 *      → **요청 토큰(req)** 을 저장소에 두고 서버가 같은 토큰이면 더하지 않는다.
 *        토큰은 저장소에 있으므로 탭이 몇 개든 같은 값을 쓴다.
 *   ③ **절사·미전송 잔여** — 500 초과분까지 보낸 것으로 처리했고, 전송 중 늘어난 증분을 다시 안 보냈다.
 *      → 서버가 돌려준 `applied` 만큼만 `sent`를 올리고, 남으면 한 번 더 보낸다.
 *   그리고 RPC 실패를 통째로 삼키던 것도 **흔적을 남긴다**(감사 지적 · L47).
 *
 * ═══ 이 파일이 하지 않는 것 (정직) ═══════════════════════════════════════
 * 오프라인 구간에서는 여전히 클라이언트가 유일한 근거다. 비행기 모드로 하루 종일 쓰면 상한을 넘길 수 있다.
 * 그것까지 막으려면 채점 자체를 서버 왕복으로 만들어야 하는데, 지하철에서도 되는 앱이라는 성질을 잃는다.
 * **여기서 멈춘 이유를 적어 둔다 — 나중에 "왜 완전하지 않지?"라고 묻는 사람에게.**
 */
import { rpc } from './supabase'
import { todayStr } from './leitner'
import { writesAllowed } from './device'

/** ★v1.4.46-b★ 키를 학습자별로 나눈다. 접미사 없는 옛 키는 첫 실행에서 이어받는다(하위호환). */
export const GRADED_KEY = 'wordcraft_review_graded_v1'
export const SERVER_KEY = 'wordcraft_review_server_v1'
/** 로컬 저장이 실제로 실패한 적이 있는가 — 조용한 실패 금지(L47). */
export const STORAGE_FAIL_KEY = 'wordcraft_storage_fail_v1'
/** RPC(서버 회계)가 마지막으로 실패한 이유 — 조용히 삼키지 않는다(감사 지적). */
export const RPC_FAIL_KEY = 'wordcraft_ledger_rpcfail_v1'

const scoped = (base: string) => (learnerId ? `${base}:${learnerId}` : base)

interface LocalLedger { date: string; n: number; sent: number; req?: string }

// 메모리 사본 — localStorage가 죽어 있어도 이 세션 동안은 정확히 센다(감사 지적 ①).
let mem: LocalLedger = { date: todayStr(), n: 0, sent: 0 }
let memLoaded = false
let serverMem: { date: string; n: number } = { date: todayStr(), n: 0 }
let storageFailed = false
let rpcFail: string | null = null

function readLocal(): LocalLedger {
  const today = todayStr()
  if (!memLoaded) {
    memLoaded = true
    try {
      // 학습자별 키를 먼저 보고, 없으면 접미사 없는 옛 키를 이어받는다(v1.4.46-a 하위호환).
      const raw = JSON.parse(
        localStorage.getItem(scoped(GRADED_KEY)) || localStorage.getItem(GRADED_KEY) || 'null',
      ) as Partial<LocalLedger> | null
      if (raw && raw.date === today) {
        const n = Math.max(0, Number(raw.n) || 0)
        // ★하위호환★ v1.4.43~45의 값에는 `sent`가 없다. 그때 센 것은 서버가 모르지만,
        //   여기서 delta로 밀면 **오늘 것을 두 번 세는** 위험이 있다. 안전한 쪽(이미 반영된 것으로 간주)을 택한다.
        mem = {
          date: today, n,
          sent: raw.sent === undefined ? n : Math.max(0, Number(raw.sent) || 0),
          req: typeof raw.req === 'string' ? raw.req : undefined,
        }
      } else {
        mem = { date: today, n: 0, sent: 0 }
      }
    } catch { mem = { date: today, n: 0, sent: 0 } }
    try {
      const sv = JSON.parse(localStorage.getItem(scoped(SERVER_KEY)) || 'null') as { date: string; n: number } | null
      if (sv && sv.date === today) serverMem = { date: today, n: Math.max(0, Number(sv.n) || 0) }
    } catch { /* 서버 캐시는 없어도 된다 */ }
    try { storageFailed = localStorage.getItem(STORAGE_FAIL_KEY) === '1' } catch { /* */ }
    try { rpcFail = localStorage.getItem(RPC_FAIL_KEY) } catch { /* */ }
  }
  if (mem.date !== today) mem = { date: today, n: 0, sent: 0 }
  if (serverMem.date !== today) serverMem = { date: today, n: 0 }
  return mem
}

function writeLocal(): void {
  try {
    localStorage.setItem(scoped(GRADED_KEY), JSON.stringify(mem))
  } catch {
    // ★삼키지 않는다★ 저장이 안 되는 기기라는 사실 자체가 화면에 보여야 한다(L47·L61 규칙 4).
    storageFailed = true
    try { localStorage.setItem(STORAGE_FAIL_KEY, '1') } catch { /* 그것도 안 되면 메모리 플래그만 */ }
  }
}

/** 로컬 저장이 실패한 기기인가 — 정보 탭·관제실이 사실대로 말할 근거. */
export function storageBroken(): boolean { readLocal(); return storageFailed }

/** 서버 회계 호출이 마지막으로 실패한 이유(없으면 null) — 정보 탭이 사실대로 말한다. */
export function ledgerRpcFailure(): string | null { readLocal(); return rpcFail }

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
/** 앱 시작·광산 진입에서 한 번 알려 준다. 없으면 서버 회계는 쉬고 로컬만 쓴다.
 *  ★학습자가 바뀌면 메모리를 반드시 비운다★ — 안 그러면 앞 아이의 카운터를 뒤 아이가 이어받는다
 *  (GPT 감사 지적 ①. 이 앱은 이제 아이가 셋이라 실제로 일어날 수 있다). */
export function setLedgerLearner(id: string | null): void {
  const next = id || null
  if (next === learnerId) return
  learnerId = next
  memLoaded = false
  mem = { date: todayStr(), n: 0, sent: 0 }
  serverMem = { date: todayStr(), n: 0 }
}

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
  /* ★요청 토큰★ 같은 증분을 두 번 보내도 서버가 한 번만 더한다(재시도·두 탭 중복 방지).
     토큰을 **저장소에 두는 것**이 핵심이다 — 탭마다 새로 만들면 중복 방지가 안 된다. */
  if (!mem.req) { mem.req = newReqToken(); writeLocal() }
  const req = mem.req
  const snapshot = l.n
  inFlight = (async () => {
    try {
      const r = await rpc('wc_review_grade', { p_learner_id: learnerId, p_delta: delta, p_req: req })
      const res = r as { graded_count?: number; applied?: number; day?: string } | null
      const n = Number(res?.graded_count)
      if (Number.isFinite(n)) {
        // 서버가 정한 '오늘'이 우리 로컬 날짜와 다르면 그 값을 오늘 값으로 쓰지 않는다(자정 경계).
        const serverDay = typeof res?.day === 'string' ? res.day : todayStr()
        if (serverDay === todayStr()) {
          serverMem = { date: todayStr(), n: Math.max(0, n) }
          try { localStorage.setItem(scoped(SERVER_KEY), JSON.stringify(serverMem)) } catch { /* */ }
        }
        // ★실제로 반영된 만큼만★ sent 를 올린다(서버는 500에서 절사한다).
        const applied = Number.isFinite(Number(res?.applied)) ? Math.max(0, Number(res?.applied)) : delta
        mem.sent = Math.max(mem.sent, Math.min(snapshot, mem.sent + applied))
        mem.req = undefined            // 반영됐으니 토큰을 비운다 — 다음 증분은 새 토큰으로
        rpcFail = null
        try { localStorage.removeItem(RPC_FAIL_KEY) } catch { /* */ }
        writeLocal()
      }
    } catch (e) {
      // ★조용히 삼키지 않는다★(감사 지적 · L47). 학습은 로컬로 계속되지만 사정은 남긴다.
      rpcFail = String(e).slice(0, 200)
      try { localStorage.setItem(RPC_FAIL_KEY, rpcFail) } catch { /* */ }
    }
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
  rpcFail = null
  learnerId = null
}

/** 요청 토큰 — 암호학적 강도는 필요 없다. 같은 증분을 구분할 수 있으면 된다. */
function newReqToken(): string {
  try {
    const a = new Uint32Array(2)
    crypto.getRandomValues(a)
    return `${a[0].toString(36)}${a[1].toString(36)}`
  } catch {
    return `${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`
  }
}
