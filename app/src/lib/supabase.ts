// 경량 Supabase REST + Auth 클라이언트 (PostgREST + GoTrue) — 외부 의존성 0
// v2(다가구): Supabase Auth 세션(JWT) 도입 — 세션이 있으면 그 토큰으로 호출(Phase3 RLS가 가족 판별),
// 없으면 기존처럼 anon 키(레거시 예한이 기기 호환). apikey 헤더는 항상 anon.
const SUPA = 'https://gbynvzxgbpmoqdsriowz.supabase.co'
const URL_BASE = `${SUPA}/rest/v1`
const AUTH_BASE = `${SUPA}/auth/v1`
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdieW52enhnYnBtb3Fkc3Jpb3d6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3NzE5NTksImV4cCI6MjA5OTM0Nzk1OX0.tMtlmdyHgq_AURSNe_D5JdHqORZ60C4I_fh1lJ19T8U'

// ★v1.4.40★ 보호자 대시보드 숫자도 관제실과 **같은 규칙**을 쓴다(L27·L51 — 라이브러리만 고치고 소비자를 두면 갈라진다).
import {
  studyTimeOfDay, accuracyOf, excludedSessionIds, learnerEvents, learnerSessions, kstDayOf,
  type MetricEvent, type MetricSession,
} from './adminMetrics'

export const FAMILY_CODE = 'wc-yehan-7351'

type Row = Record<string, unknown>

// ---------- Auth 세션 (GoTrue) ----------
interface Session { access_token: string; refresh_token: string; expires_at: number }
const SESSION_KEY = 'wordcraft_auth_v1'
const AUTH_KIND_KEY = 'wordcraft_auth_kind_v1'
let session: Session | null = (() => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null') as Session | null } catch { return null }
})()
function saveSession(s: Session | null) {
  session = s
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY) } catch { /* */ }
}
/** v1.4.16 — 이 기기의 정체(보호자 구글 / 아이 익명)를 세션과 별개로 기억한다.
 *  세션이 잠깐 끊겨도 보호자 기기가 익명 아이 기기로 강등되는 사고를 막는다(L23). */
export type AuthKind = 'guardian' | 'device'
export function authKind(): AuthKind | null {
  try { const v = localStorage.getItem(AUTH_KIND_KEY); return v === 'guardian' || v === 'device' ? v : null } catch { return null }
}
function setAuthKind(k: AuthKind | null) {
  try { k ? localStorage.setItem(AUTH_KIND_KEY, k) : localStorage.removeItem(AUTH_KIND_KEY) } catch { /* */ }
}
export function isAuthed(): boolean { return !!session }
export function authToken(): string | null { return session?.access_token ?? null }

async function authReq(path: string, init: RequestInit = {}): Promise<Row> {
  const res = await fetch(`${AUTH_BASE}${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json', ...(init.headers || {}) },
  })
  const text = await res.text()
  const body = (text ? JSON.parse(text) : {}) as Row
  if (!res.ok) throw new Error(`auth ${res.status}: ${text}`)
  return body
}
function storeTokens(r: Row): boolean {
  const at = r.access_token as string | undefined
  const rt = r.refresh_token as string | undefined
  if (at && rt) {
    saveSession({ access_token: at, refresh_token: rt, expires_at: Date.now() + (Number(r.expires_in) || 3600) * 1000 })
    return true
  }
  return false
}
/** 익명 로그인(아이 기기) — 자격증명 없이 signup = 익명 세션(대시보드에서 익명 로그인 ON 필요).
 *  ⚠️ 호출할 때마다 **새 계정**이 만들어진다. 평상시엔 반드시 `ensureAnonSession()`을 쓸 것(L23). */
export async function signInAnonymously(): Promise<void> {
  const r = await authReq('/signup', { method: 'POST', body: JSON.stringify({ data: {}, gotrue_meta_security: {} }) })
  if (storeTokens(r)) setAuthKind('device')
}
/** v1.4.16 — 익명 세션 "확보". 이미 살아있거나 리프레시로 되살릴 수 있는 세션이 있으면 재사용한다.
 *  (기존 코드는 조건 없이 signInAnonymously()를 불러 앱을 열 때마다 익명 계정이 하나씩 늘어났다 — L23.) */
export async function ensureAnonSession(): Promise<AuthUser | null> {
  const existing = await getAuthUser()
  if (existing) return existing
  await signInAnonymously()
  return await getAuthUser()
}
/** 구글 로그인(보호자) — 리디렉션. 돌아오면 URL 해시에 토큰이 실려온다. */
export function signInWithGoogle(redirectTo: string = location.origin + location.pathname): void {
  location.href = `${AUTH_BASE}/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`
}
/** 앱 로드 시 구글 콜백 해시(#access_token=...) 처리 — 토큰 저장 후 해시 정리(라우팅 해시엔 영향 없음) */
export function consumeAuthRedirect(): boolean {
  try {
    const h = location.hash || ''
    if (h.includes('access_token=')) {
      const p = new URLSearchParams(h.replace(/^#/, ''))
      const at = p.get('access_token'), rt = p.get('refresh_token')
      if (at && rt) {
        saveSession({ access_token: at, refresh_token: rt, expires_at: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000 })
        setAuthKind('guardian') // 구글 콜백 = 보호자 기기 (세션이 끊겨도 익명으로 강등되지 않게)
        history.replaceState(null, '', location.pathname + location.search)
        return true
      }
    }
  } catch { /* */ }
  return false
}
async function refreshSession(): Promise<boolean> {
  if (!session?.refresh_token) return false
  try {
    const r = await authReq('/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }) })
    return storeTokens(r)
  } catch (e) {
    // 리프레시 토큰이 진짜로 무효일 때만(400/401/403) 세션을 버린다.
    // 네트워크 끊김·5xx로 세션을 버리면 오프라인에서 로그아웃되고, 다음 실행 때 새 익명 계정이 생긴다(L23).
    if (/\bauth (400|401|403)\b/.test(String(e))) saveSession(null)
    return false
  }
}
/** 액세스 토큰이 만료됐거나 1분 내 만료 예정이면 미리 갱신. */
async function ensureFreshSession(): Promise<boolean> {
  if (!session) return false
  if (session.expires_at && session.expires_at - Date.now() > 60_000) return true
  return await refreshSession()
}
export interface AuthUser { id: string; email?: string; is_anonymous?: boolean }
export async function getAuthUser(): Promise<AuthUser | null> {
  if (!session) return null
  await ensureFreshSession()
  if (!session) return null
  const ask = async (): Promise<AuthUser> =>
    await authReq('/user', { headers: { Authorization: `Bearer ${session!.access_token}` } }) as unknown as AuthUser
  try {
    const u = await ask(); setAuthKind(u.is_anonymous ? 'device' : 'guardian'); return u
  } catch {
    // ★L23★ 여기서 그냥 null을 돌려주면 앱은 "세션 없음"으로 보고 **새 익명 계정을 만든다.**
    // 액세스 토큰 만료는 정상 상황이므로, 리프레시로 1회 되살려 본 뒤에만 로그아웃으로 판정한다.
    if (await refreshSession()) {
      try { const u = await ask(); setAuthKind(u.is_anonymous ? 'device' : 'guardian'); return u } catch { /* */ }
    }
    return null
  }
}
export async function signOut(): Promise<void> {
  try { if (session) await authReq('/logout', { method: 'POST', headers: { Authorization: `Bearer ${session.access_token}` } }) } catch { /* */ }
  saveSession(null)
  setAuthKind(null)
}

// ---------- REST (세션 토큰 우선, 없으면 anon — 레거시 호환) ----------
async function doFetch(path: string, init: RequestInit, token: string): Promise<Response> {
  return fetch(`${URL_BASE}${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  })
}
async function req(path: string, init: RequestInit = {}): Promise<Row[]> {
  let res = await doFetch(path, init, session?.access_token || ANON_KEY)
  if (res.status === 401 && session && await refreshSession()) res = await doFetch(path, init, session.access_token)
  if (!res.ok) throw new Error(`supabase ${res.status}: ${await res.text()}`)
  const text = await res.text()
  return text ? JSON.parse(text) : []
}

/** ★v1.4.40★ **행을 받지 않고 개수만** 센다. PostgREST `Prefer: count=exact` + `Range: 0-0`.
 *  아이 폰에서 4,432행을 끌어와 세는 것은 낭비다 — 헤더 한 줄이면 된다.
 *  (`req()`는 본문만 돌려주므로 여기서만 직접 fetch한다.) */
export async function countRows(table: string, query: string): Promise<number | null> {
  const call = (token: string) => fetch(`${URL_BASE}/${table}?${query}`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, Prefer: 'count=exact', Range: '0-0' },
  })
  try {
    let res = await call(session?.access_token || ANON_KEY)
    if (res.status === 401 && session && await refreshSession()) res = await call(session.access_token)
    if (!res.ok && res.status !== 206) return null
    const cr = res.headers.get('content-range')          // 예: "0-0/4432"
    const n = cr ? Number(cr.split('/')[1]) : NaN
    return Number.isFinite(n) ? n : null
  } catch { return null }
}

export const db = {
  select: (table: string, query: string) => req(`/${table}?${query}`),
  insert: (table: string, rows: Row | Row[]) =>
    req(`/${table}`, { method: 'POST', body: JSON.stringify(rows) }),
  /** ignore=true면 이미 있는 행은 건드리지 않음 (복습 카드 박스 보존 등 성취 보호용) */
  upsert: (table: string, rows: Row | Row[], onConflict: string, ignore = false) =>
    req(`/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      body: JSON.stringify(rows),
      headers: { Prefer: `resolution=${ignore ? 'ignore' : 'merge'}-duplicates,return=representation` },
    }),
  update: (table: string, query: string, patch: Row) =>
    req(`/${table}?${query}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  /** v1.4.22 — 보상 목표 삭제 전용. ⚠️ 학습 기록 테이블(answer_events 등)에는 절대 쓰지 말 것(L17). */
  del: (table: string, query: string) =>
    req(`/${table}?${query}`, { method: 'DELETE' }),
  /** v1.4.38 — 서버 상한을 넘겨 **전부** 받아온다. 아래 selectAll 참조. */
  selectAll: (table: string, query: string, maxRows?: number) => selectAll(table, query, maxRows),
}

/* ═══════════════════════════════════════════════════════════════════════
   ★★v1.4.38 — `limit=`은 요청일 뿐이다. 서버가 더 적게 준다★★

   2026-08-15 관제실 v3의 정합성 진단이 배포 직후 스스로 잡아낸 결함이다.
   화면에 "저장된 XP 44,569 vs 기록으로 계산한 XP 12,537 (+255%)"가 떴다.
   원인은 산식이 아니라 **조회**였다 — Supabase Data API의 `Max rows` 기본값이 **1,000**이라,
   `limit=12000`을 보내도 서버는 1,000행만 준다. 예한이 문항은 이미 4,432건이다.

   즉 관제실의 누적 분석(취약 영역·반응 속도·활동 유형별 정답률·반복 오답·캘린더 히트맵·
   7일 추이·학습 밸런스)은 **처음부터 최근 1,000문항만** 보고 있었다. 120일치를 보여준다고
   적어 놓고 실제로는 열흘치를 계산하고 있었던 것이다. 아무도 몰랐던 이유는
   누적 XP가 `Math.max(앱 저장값, 파생값)`으로 가려져 있었기 때문이다(L45와 같은 형태).

   ★교훈★: 클라이언트가 보낸 `limit`은 **상한 요청**이지 보장이 아니다.
   "몇 행 왔는지"를 세서 상한과 비교하는 것으로는 부족하다 — 서버 상한이 내 상한보다 작으면
   그 검사는 영원히 통과한다. **끝까지 받아오거나(페이지네이션), 못 받았음을 알아야 한다.**
   ═══════════════════════════════════════════════════════════════════════ */

/** 서버가 한 번에 주는 최대 행 수(Supabase Data API `Max rows` 기본값). 이보다 크게 요청해도 잘린다. */
export const PAGE_ROWS = 1000
/** 안전 상한 — 이 이상은 받지 않는다(무한 루프·메모리 폭주 방지). 도달하면 truncated=true. */
export const DEFAULT_MAX_ROWS = 50000

/** 쿼리에서 limit/offset을 떼어낸다 — 페이지네이션이 직접 붙이기 때문. */
function stripPaging(query: string): string {
  return query.split('&').filter(p => p && !/^limit=/.test(p) && !/^offset=/.test(p)).join('&')
}

/**
 * 상한에 걸려 조용히 잘리지 않는 조회. `order`가 없으면 페이지 경계에서 행이 중복·유실되므로
 * **반드시 정렬이 포함된 쿼리를 넘긴다**(L31).
 *
 * @returns rows — 모아진 전체 행 / truncated — 안전 상한에 걸려 더 있는데 못 받았는가
 */
export async function selectAll(
  table: string, query: string, maxRows: number = DEFAULT_MAX_ROWS,
): Promise<{ rows: Row[]; truncated: boolean }> {
  const base = stripPaging(query)
  const out: Row[] = []
  for (let offset = 0; offset < maxRows; offset += PAGE_ROWS) {
    const page = Math.min(PAGE_ROWS, maxRows - offset)
    const rows = await req(`/${table}?${base}&limit=${page}&offset=${offset}`)
    out.push(...rows)
    // 서버가 요청보다 적게 줬다 = 마지막 페이지다.
    if (rows.length < page) return { rows: out, truncated: false }
  }
  return { rows: out, truncated: true }
}

/** RPC 호출 (세션 토큰 우선) */
export async function rpc(fn: string, args: Row): Promise<unknown> {
  const call = (token: string) => fetch(`${URL_BASE}/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  let res = await call(session?.access_token || ANON_KEY)
  if (res.status === 401 && session && await refreshSession()) res = await call(session.access_token)
  const text = await res.text()
  if (!res.ok) throw new Error(`rpc ${res.status}: ${text}`)
  return text ? JSON.parse(text) : null
}
/** 가족 코드로 연결 (보호자=guardian / 아이기기=device) */
export async function joinFamily(code: string, role: 'guardian' | 'device', relation?: string | null, learnerId?: string | null): Promise<unknown> {
  return rpc('wc_join_family', { p_code: code, p_role: role, p_relation: relation ?? null, p_learner_id: learnerId ?? null })
}
/** 가족 코드로 그 가족의 아이(프로필) 목록 */
export async function familyLearners(code: string): Promise<{ id: string; nickname: string }[]> {
  const r = await rpc('wc_family_learners', { p_code: code })
  return (Array.isArray(r) ? r : []) as { id: string; nickname: string }[]
}
/** Phase 3: 레거시 기기(로컬 learnerId 보유·세션無) 무중단 이관 — 현재 익명 세션을 그 learner에 device 바인딩 */
export async function bindLegacyDevice(learnerId: string): Promise<void> {
  await rpc('wc_bind_legacy_device', { p_learner_id: learnerId })
}

// ---------- Phase 5: 슈퍼관리자 콘솔 (소유자) + 보호자 셀프서비스 ----------
export interface AdminLearner { id: string; nickname: string; level: number; xp: number }
export interface AdminGuardian { relation: string | null; role: string; joined_at: string; who: string }
export interface AdminFamily {
  id: string; name: string; join_code: string; parent_name: string | null; created_at: string
  learners: AdminLearner[]
  /** v1.4.16 — 이 가족의 보호자 연결 현황. 빈 배열 = 부모가 아직 한 번도 로그인하지 않음. */
  guardians?: AdminGuardian[]
  device_count?: number
}
export interface GuardianFamily { id: string; name: string; join_code: string; parent_name: string | null; learners: AdminLearner[] }
export async function isOwner(): Promise<boolean> {
  try { return (await rpc('wc_is_owner', {})) === true } catch { return false }
}
export async function adminListFamilies(): Promise<AdminFamily[]> {
  const r = await rpc('wc_admin_list_families', {})
  return (Array.isArray(r) ? r : []) as AdminFamily[]
}
export async function adminCreateFamily(name: string, code: string, parentName: string): Promise<AdminFamily> {
  return await rpc('wc_admin_create_family', { p_name: name, p_code: code, p_parent_name: parentName }) as AdminFamily
}
/** v1.4.16 — 소유자: 가족 이름·부모 이름 수정 (빈 값은 기존 값 유지) */
export async function adminUpdateFamily(familyId: string, name: string, parentName: string): Promise<void> {
  await rpc('wc_admin_update_family', { p_family_id: familyId, p_name: name, p_parent_name: parentName })
}
export async function adminAddLearner(familyId: string, nickname: string): Promise<AdminLearner> {
  return await rpc('wc_admin_add_learner', { p_family_id: familyId, p_nickname: nickname }) as AdminLearner
}
/** 보호자(부모) 대시보드: 내 가족 + 아이 목록 */
export async function guardianFamily(): Promise<GuardianFamily | null> {
  const r = await rpc('wc_guardian_family', {})
  return (r && typeof r === 'object') ? r as GuardianFamily : null
}
/** 보호자(부모)가 자기 가족에 아이 추가 */
export async function guardianAddLearner(nickname: string): Promise<AdminLearner> {
  return await rpc('wc_guardian_add_learner', { p_nickname: nickname }) as AdminLearner
}
/** 보호자(부모): 아이 이름 수정 */
export async function guardianRenameLearner(learnerId: string, nickname: string): Promise<void> {
  await rpc('wc_guardian_rename_learner', { p_learner_id: learnerId, p_nickname: nickname })
}
/** 보호자(부모): 아이 삭제 (학습 기록 없는 경우만) — 실패 시 예외('has learning data') */
export async function guardianRemoveLearner(learnerId: string): Promise<void> {
  await rpc('wc_guardian_remove_learner', { p_learner_id: learnerId })
}
/** v1.4.16 — 보호자 대시보드용 아이별 한눈 요약.
 *  가족 아이 전원의 (오늘 학습 분 · 최근7일 정답률 · 밀린 복습 카드 · 마지막 학습일)을 3회 질의로 모아 계산한다.
 *  RLS: 보호자는 자기 가족 아이의 행만 읽으므로 learner_id in.(...) 만으로 안전하다. */
export interface KidStat {
  /** 오늘 **실제로 문제를 푼** 시간(분) — 관제실의 '오늘 학습'과 같은 산식 */
  todayMin: number
  /** 오늘 푼 문항 수. 0이면 todayMin도 0이다(증거 없는 시간은 학습이 아니다 — L45) */
  todayAnswers: number
  /** 최근 7일 **신규 학습** 정답률 (복습·자기채점·진단 제외 — 섞으면 실력이 안 보인다) */
  week: { total: number; correct: number }
  dueCards: number
  lastActive: string | null
}
function kstDayStr(offsetDays = 0): string {
  const d = new Date(Date.now() + 9 * 3600_000 + offsetDays * 86400_000)
  return d.toISOString().slice(0, 10)
}
/* ★★v1.4.40 — 이 함수가 "오늘 703분 ✓"를 다른 라우트에서 부활시키고 있었다★★
   2026-08-16 독립 교차 검증:
     · `todayMin`이 `sessions.duration_seconds` **원본 합**이었다 — 문항 증거도, 벽시계 클램프도,
       3시간 상한도, 기기 분리도 없다. `adminMetrics.ts` 머리말이 "거짓이었다"고 못 박은 그 계산 그대로다.
       같은 아빠가 같은 시각에 관제실에선 "0분", 가족 카드에선 "오늘 865분 ✓"(초록)를 봤다.
     · 주간 정답률은 복습·자기채점을 섞었고, 조회 3건 모두 `db.select`라 **1,000행에서 잘렸다**
       (8/14 하루가 1,179건 — "7일 정답률"이 실제로는 하루도 안 되는 표본이었다).
     · v1.4.38의 selectAll 전환이 AdminPage와 ReviewMine만 훑고 이 파일 안의 이 함수를 빠뜨렸다.
   → 규칙은 adminMetrics 하나만 쓴다. 숫자를 여기서 다시 만들지 않는다(L27·L51). */
export async function guardianKidStats(ids: string[]): Promise<Record<string, KidStat>> {
  const out: Record<string, KidStat> = {}
  for (const id of ids) out[id] = { todayMin: 0, todayAnswers: 0, week: { total: 0, correct: 0 }, dueCards: 0, lastActive: null }
  if (!ids.length) return out
  const inList = `in.(${ids.join(',')})`
  const todayKey = kstDayStr()
  const weekAgoUtc = new Date(`${kstDayStr(-6)}T00:00:00+09:00`).toISOString()
  const [ses, ans, cards] = await Promise.all([
    selectAll('sessions', `learner_id=${inList}&started_at=gte.${weekAgoUtc}&select=id,learner_id,started_at,ended_at,duration_seconds,device&order=started_at.asc`).catch(() => ({ rows: [] as Row[], truncated: false })),
    selectAll('answer_events', `learner_id=${inList}&created_at=gte.${weekAgoUtc}&select=learner_id,session_id,activity_type,is_correct,created_at,module_id,response_ms&order=created_at.asc`).catch(() => ({ rows: [] as Row[], truncated: false })),
    selectAll('review_cards', `learner_id=${inList}&due_date=lte.${todayKey}&select=learner_id&order=id.asc`).catch(() => ({ rows: [] as Row[], truncated: false })),
  ])
  type SesRow = MetricSession & { learner_id: string }
  type AnsRow = MetricEvent & { learner_id: string }
  const sesRows = ses.rows as unknown as SesRow[]
  const ansRows = ans.rows as unknown as AnsRow[]
  // 아빠 PC(desktop) 세션에서 나온 것은 전부 뺀다 — 아이 지표가 아니다.
  const excluded = excludedSessionIds(sesRows)

  // v1.4.40-b — '최근'은 **문항 기준**이다. 세션 기준이면 앱만 열어 본 날이 "최근 학습"으로 뜬다.
  const byKid = new Map<string, AnsRow[]>()
  for (const e of learnerEvents(ansRows, excluded)) {
    const arr = byKid.get(e.learner_id); if (arr) arr.push(e); else byKid.set(e.learner_id, [e])
  }
  for (const [kid, evs] of byKid) {
    const s = out[kid]; if (!s) continue
    const kidSessions = learnerSessions(sesRows.filter(x => x.learner_id === kid))
    const t = studyTimeOfDay(evs, kidSessions, todayKey)
    for (const e of evs) { const d = kstDayOf(e.created_at); if (!s.lastActive || d > s.lastActive) s.lastActive = d }
    s.todayMin = Math.round(t.focusSec / 60)
    s.todayAnswers = t.answers
    const a = accuracyOf(evs)                       // 신규 학습만 (복습·자기채점·진단 제외)
    s.week = { total: a.newTotal, correct: a.newCorrect }
  }
  for (const r of cards.rows as { learner_id: string }[]) { const s = out[r.learner_id]; if (s) s.dueCards++ }
  return out
}

/** 아이별 원터치 연결 딥링크 (문자로 전달용) */
export function kidConnectLink(learnerId: string, nickname: string): string {
  return `${location.origin}/#/connect?kid=${learnerId}&name=${encodeURIComponent(nickname)}`
}

export interface Learner {
  id: string
  family_code: string
  family_id?: string | null
  nickname: string
  admin_pin: string
  xp: number
  level: number
  streak_days: number
  last_active_date: string | null
}

const LEARNER_COLS = 'id,family_code,family_id,nickname,admin_pin,xp,level,streak_days,last_active_date'

export async function fetchLearner(): Promise<Learner> {
  const rows = await db.select('learners', `family_code=eq.${FAMILY_CODE}&limit=1`)
  if (!rows.length) throw new Error('learner not found')
  return rows[0] as unknown as Learner
}

/** id로 learner 단건 조회 (기기 세션이 바인딩된 아이 로드용) */
export async function fetchLearnerById(id: string): Promise<Learner | null> {
  const rows = await db.select('learners', `id=eq.${id}&select=${LEARNER_COLS}&limit=1`)
  return rows.length ? (rows[0] as unknown as Learner) : null
}

/** 이 기기(익명 세션)에 연결된 아이 learner — memberships(role=device)의 learner_id로 조회.
 *  연결 안 됐거나 오류면 null(레거시 폴백은 호출부가 처리). */
export async function myDeviceLearner(uid: string): Promise<Learner | null> {
  try {
    const m = await db.select('memberships', `user_id=eq.${uid}&role=eq.device&select=learner_id&limit=1`)
    const lid = m.length ? ((m[0] as { learner_id?: string | null }).learner_id ?? null) : null
    if (!lid) return null
    return await fetchLearnerById(lid)
  } catch { return null }
}

/** 보호자(구글) 세션의 가족 + 그 가족 아이들.
 *  familyId=null = 아직 가족 미가입(가족 코드 입력 필요). learners=가족 내 아이 목록(없을 수 있음). */
export async function myFamilyLearners(uid: string): Promise<{ familyId: string | null; learners: Learner[] }> {
  const m = await db.select('memberships', `user_id=eq.${uid}&role=in.(owner,guardian)&select=family_id&limit=1`)
  if (!m.length) return { familyId: null, learners: [] }
  const familyId = (m[0] as { family_id?: string | null }).family_id ?? null
  if (!familyId) return { familyId: null, learners: [] }
  const rows = await db.select('learners', `family_id=eq.${familyId}&select=${LEARNER_COLS}&order=nickname.asc&limit=200`)
  return { familyId, learners: rows as unknown as Learner[] }
}
