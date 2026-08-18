/** admin_check.mjs — 관제실 지표 회귀 봉인 (v1.4.35 신설)
 *
 * 검사 대상은 "코드가 컴파일되는가"가 아니라 **2026-08-15에 실제로 일어난 거짓말이 되살아나는가**다.
 * 그래서 모든 케이스는 라이브 DB에서 실측한 값을 그대로 쓴다.
 *
 * 실행: node admin_check.mjs   (verify.sh에서 부른다)
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/admin_entry.ts', `import * as A from '../src/lib/adminMetrics'\n// @ts-ignore\nglobalThis.A = A\n`)
execSync('/root/.bun/bin/bun build .verify/admin_entry.ts --outfile .verify/admin_bundle.js --target node', { stdio: 'inherit' })
const A = (await import('./.verify/admin_bundle.js'), globalThis.A)

let fail = 0
const ok = (cond, name, extra = '') => {
  if (cond) console.log(`  ✓ ${name}`)
  else { console.log(`  ✗ ${name} ${extra}`); fail++ }
}
const iso = (kst) => new Date(`${kst}+09:00`).toISOString()

console.log('── ① 학습 시간: 증거 없는 시간은 학습이 아니다 ──')
{
  // 2026-08-15 실측 재현: 문항 0개 · 세션 12건 합계 42,216초(최대 37,027초)
  const sessions = [
    { id: 244, started_at: iso('2026-08-15T01:08:04'), ended_at: iso('2026-08-15T11:25:11'), duration_seconds: 37027, device: 'desktop' },
    { id: 245, started_at: iso('2026-08-15T11:25:12'), ended_at: iso('2026-08-15T11:31:41'), duration_seconds: 386, device: 'desktop' },
  ]
  const t = A.studyTimeOfDay([], sessions, '2026-08-15', Date.parse(iso('2026-08-15T12:00:00')))
  ok(t.focusSec === 0, '문항 0개인 날의 학습 시간 = 0초', `→ ${t.focusSec}`)
  // 켜 둔 시간은 숨기지 않되, 한 세션은 3시간에서 자른다(그 이상은 사람이 앉아 있던 시간이 아니다)
  ok(t.openSec >= A.SESSION_MAX_SEC, '켜 둔 시간은 그대로 보인다(숨기지 않는다)', `→ ${t.openSec}`)
  ok(t.openSec <= A.SESSION_MAX_SEC + 400, '한 세션은 3시간 상한에서 잘린다', `→ ${t.openSec}`)
  ok(t.answers === 0, '문항 수 0')
  // ★옛 규칙(Math.max)이 되살아나면 반드시 실패해야 한다★
  ok(t.focusSec < t.openSec, '학습 시간이 켜 둔 시간보다 크지 않다 (Math.max 회귀 감시)')
}
{
  // 벽시계보다 긴 duration = 다중 탭 덮어쓰기 (실측 세션 #242: 실경과 69초 / 기록 1,150초)
  const s = { id: 242, started_at: iso('2026-08-15T00:39:37'), ended_at: iso('2026-08-15T00:40:46'), duration_seconds: 1150, device: 'desktop' }
  ok(A.isSessionCorrupt(s) === true, '벽시계를 넘긴 세션을 파손으로 잡는다')
  ok(A.credibleSessionSec(s) <= 70, '파손 세션은 벽시계로 깎인다', `→ ${A.credibleSessionSec(s)}`)
}
{
  // 정상: 5분 간격 안에서 20문항을 푼 하루
  const evs = Array.from({ length: 20 }, (_, i) => ({
    activity_type: 'quiz', is_correct: i % 4 !== 0, module_id: 'C0', response_ms: 5000,
    created_at: iso(`2026-08-14T20:${String(10 + i).padStart(2, '0')}:00`),
  }))
  const t = A.studyTimeOfDay(evs, [], '2026-08-14')
  ok(t.focusSec >= 19 * 60 && t.focusSec <= 20 * 60 + A.EDGE_GRACE_SEC, '문항 간격이 그대로 학습 시간이 된다', `→ ${t.focusSec}`)
  // 5분 이상 벌어진 구간은 버린다
  const gapped = [...evs, { ...evs[0], created_at: iso('2026-08-14T23:59:00') }]
  const t2 = A.studyTimeOfDay(gapped, [], '2026-08-14')
  ok(t2.focusSec - t.focusSec < 60, '5분 넘게 벌어진 구간은 학습 시간에 안 들어간다', `→ +${t2.focusSec - t.focusSec}`)
}

console.log('── ② 정답률: 신규와 복습을 섞지 않는다 ──')
{
  // 실측 비율 재현: 복습 1650건(99.8%) + 신규 1004건(86.6%) + 자기채점 40 + 발견 83
  const mk = (type, n, correct) => Array.from({ length: n }, (_, i) => ({
    activity_type: type, is_correct: i < correct, module_id: 'X', response_ms: null,
    created_at: iso('2026-08-14T20:00:00'),
  }))
  const evs = [...mk('review', 1000, 998), ...mk('quiz', 100, 60), ...mk('speak', 40, 40), ...mk('forge_discover', 83, 83)]
  const a = A.accuracyOf(evs)
  ok(a.newPct === 60, '신규 정답률은 신규만 센다', `→ ${a.newPct}`)
  ok(a.reviewPct === 100, '복습 정답률은 따로 나온다', `→ ${a.reviewPct}`)
  ok(a.excluded === 123, '말하기·문장 발견은 분모에서 뺀다', `→ ${a.excluded}`)
  ok(a.blendedPct !== null && a.blendedPct > a.newPct + 25, '섞으면 얼마나 부푸는지 대조값이 남는다', `→ ${a.blendedPct}`)
  ok(A.isAssessed({ activity_type: 'speak' }) === false, 'speak는 채점 대상이 아니다')
  ok(A.isAssessed({ activity_type: 'game_match' }) === true, 'game_match는 채점 대상이다')
}

console.log('── ③ 진도: 분모는 아이 화면과 같아야 한다 ──')
{
  const base = ['A1','A2','A3','A4','R0','R1','R2','R3','R4','R5','R6','R7','R8','R9','C0','C5','C6','C7','B21a','B21b','B22a','B22b','D1S','D2S','D3S','T1','T2','T3']
  const prog = base.map(module_id => ({ module_id, status: 'completed', best_score: 90, completed_at: null, updated_at: '', mastered_at: null }))
  const closed = A.progressView(prog, false)
  const open = A.progressView(prog, true)
  ok(closed.total === 28 && closed.pct === 100, '월드 7~10이 잠겨 있으면 28/28 = 100%')
  ok(open.total === 52 && open.done === 28 && open.pct === 54, '★열려 있으면 28/52 = 54% (100% 거짓말 회귀 감시)', `→ ${open.done}/${open.total} ${open.pct}%`)
  ok(open.extDone === 0 && open.extTotal === 24, '확장 진도를 따로 센다')
}

console.log('── ④ 복습 부채 ──')
{
  const cards = [
    ...Array.from({ length: 300 }, (_, i) => ({ card_id: `c${i}`, box: 1, due_date: '2026-08-01' })),
    ...Array.from({ length: 76 }, (_, i) => ({ card_id: `d${i}`, box: 3, due_date: '2026-08-15' })),
    { card_id: 'later', box: 5, due_date: '2026-09-01' },
  ]
  const evs = Array.from({ length: 84 }, () => ({ activity_type: 'review', is_correct: true, module_id: 'R', response_ms: null, created_at: iso('2026-08-13T20:00:00') }))
  const d = A.reviewDebtOf(cards, evs, '2026-08-15')
  ok(d.due === 376, '오늘 캘 수 있는 카드 = 376장 (실측과 일치)', `→ ${d.due}`)
  ok(d.overdue === 300, '기한 지난 카드를 따로 센다', `→ ${d.overdue}`)
  ok(d.oldestOverdueDays === 14, '가장 오래 밀린 날수', `→ ${d.oldestOverdueDays}`)
  ok(d.overCapacity === true, '하루 감당량을 넘으면 경고 플래그')
  ok(d.daysToClear !== null && d.daysToClear > 1, '다 갚는 데 걸리는 날을 낸다', `→ ${d.daysToClear}`)
}

console.log('── ⑤ 정합성 진단: 관제실이 스스로를 의심한다 ──')
{
  const t0 = A.studyTimeOfDay([], [{ id: 1, started_at: iso('2026-08-15T01:00:00'), ended_at: iso('2026-08-15T11:00:00'), duration_seconds: 36000, device: 'desktop' }], '2026-08-15', Date.parse(iso('2026-08-15T12:00:00')))
  const issues = A.integrityCheck({
    today: t0, week: [t0], xp: { derived: 39546, stored: 40069, diff: 523, diffPct: 1.3, truncated: false },
    progress: A.progressView([], true),
    debt: A.reviewDebtOf([], [], '2026-08-15'),
    badgeOnlyInAdmin: ['forge_5', 'forge_20', 'forge_50'], badgeOnlyInApp: ['rapid_20'],
    eventsTruncated: false, sessionsTruncated: false, failedTables: [],
  })
  const ids = issues.map(i => i.id)
  ok(ids.includes('open_no_answer'), '켜져만 있고 푼 기록이 없으면 P0로 띄운다')
  ok(ids.includes('badge_missing_app'), '아이가 못 받은 뱃지를 잡아낸다')
  ok(ids.includes('device_mix'), 'PC 기록 혼입을 알린다')
  ok(ids.includes('xp_gap'), '저장 XP와 파생 XP 차이를 알린다')
  ok(issues[0].level === 'P0', '심각한 것이 맨 위로 정렬된다')
  const clean = A.integrityCheck({
    today: A.studyTimeOfDay([{ activity_type: 'quiz', is_correct: true, module_id: 'A1', response_ms: 1, created_at: iso('2026-08-15T09:00:00') }], [], '2026-08-15'),
    week: [], xp: { derived: 100, stored: 100, diff: 0, diffPct: 0, truncated: false },
    progress: A.progressView([], false), debt: A.reviewDebtOf([], [], '2026-08-15'),
    badgeOnlyInAdmin: [], badgeOnlyInApp: [], eventsTruncated: false, sessionsTruncated: false, failedTables: [],
  })
  ok(clean.length === 0, '문제가 없으면 아무것도 띄우지 않는다 (경보 피로 방지)', `→ ${clean.map(i => i.id).join(',')}`)
  const failed = A.integrityCheck({
    today: t0, week: [], xp: { derived: 0, stored: 0, diff: 0, diffPct: 0, truncated: true },
    progress: A.progressView([], false), debt: A.reviewDebtOf([], [], '2026-08-15'),
    badgeOnlyInAdmin: [], badgeOnlyInApp: [], eventsTruncated: true, sessionsTruncated: false, failedTables: ['복습 카드'],
  })
  ok(failed.some(i => i.id === 'fetch_failed'), '조회 실패를 삼키지 않는다')
  ok(failed.some(i => i.id === 'events_truncated'), '조회 상한 포화를 알린다')
}

console.log('── ⑥ XP 파생 ──')
{
  const evs = [
    { activity_type: 'quiz', is_correct: true, module_id: 'A1', response_ms: null, created_at: iso('2026-08-14T20:00:00') },
    { activity_type: 'vocab', is_correct: true, module_id: 'V1-01', response_ms: null, created_at: iso('2026-08-14T20:01:00') },
    { activity_type: 'diagnostic', is_correct: true, module_id: 'DIAG-D1', response_ms: null, created_at: iso('2026-08-14T20:02:00') },
    ...Array.from({ length: 10 }, () => ({ activity_type: 'review', is_correct: true, module_id: 'R1', response_ms: null, created_at: iso('2026-08-14T20:03:00') })),
  ]
  const prog = [
    { module_id: 'A1', status: 'mastered', best_score: 100, completed_at: null, updated_at: '', mastered_at: iso('2026-07-18T10:00:00') },
    { module_id: 'V1-01', status: 'completed', best_score: 100, completed_at: null, updated_at: '', mastered_at: null },
  ]
  // 문항 10 + 5 + 0 + 복습 100 = 115 / 모듈 50 + 팩 45 = 95 / 유령 50 / 콤보 20 → 280
  const got = A.deriveXp(evs, prog)
  ok(got === 280, 'XP 파생이 CONTRACT §2 산식과 1:1', `→ ${got}`)
  const audit = A.xpAudit(evs, prog, 300, false)
  ok(audit.diff === 20, '저장값과의 차이를 그대로 보고한다', `→ ${audit.diff}`)
}


console.log('── ⑦ 조회 페이지네이션: 서버가 1,000행에서 자른다 ──')
{
  // 2026-08-15 라이브에서 실제로 벌어진 일: `limit=12000`을 보냈는데 서버(Supabase Data API의
  // Max rows=1000)가 1,000행만 줬다. 그래서 관제실 누적 분석이 최근 1,000문항만 보고 있었고,
  // 정합성 진단이 "저장 XP 44,569 vs 파생 12,537"로 잡아냈다. selectAll이 끝까지 받아오는지 본다.
  writeFileSync('.verify/supa_entry.ts', `import * as S from '../src/lib/supabase'\n// @ts-ignore\nglobalThis.S = S\n`)
  execSync('/root/.bun/bin/bun build .verify/supa_entry.ts --outfile .verify/supa_bundle.js --target node', { stdio: 'inherit' })
  const TOTAL = 4432, CAP = 1000
  let calls = 0
  globalThis.localStorage = undefined
  globalThis.fetch = async (url) => {
    calls++
    const u = new URL(String(url))
    const limit = Math.min(Number(u.searchParams.get('limit')), CAP)   // ★서버 상한★
    const offset = Number(u.searchParams.get('offset')) || 0
    const n = Math.max(0, Math.min(limit, TOTAL - offset))
    return { ok: true, status: 200, text: async () => JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: offset + i }))) }
  }
  await import('./.verify/supa_bundle.js')
  const S = globalThis.S
  ok(S.PAGE_ROWS === CAP, '서버 상한을 페이지 크기로 안다', `→ ${S.PAGE_ROWS}`)
  const r = await S.selectAll('answer_events', 'learner_id=eq.x&order=created_at.desc&limit=12000')
  ok(r.rows.length === TOTAL, `★상한을 넘겨 전부 받아온다 (${TOTAL}행)`, `→ ${r.rows.length}`)
  ok(r.truncated === false, '다 받았으면 truncated=false')
  ok(calls === Math.ceil(TOTAL / CAP) + (TOTAL % CAP === 0 ? 1 : 0), '필요한 만큼만 요청한다', `→ ${calls}회`)
  const ids = new Set(r.rows.map(x => x.id))
  ok(ids.size === TOTAL, '페이지 경계에서 행이 중복·유실되지 않는다', `→ ${ids.size}`)
  const capped = await S.selectAll('answer_events', 'learner_id=eq.x&order=id.asc', 2000)
  ok(capped.rows.length === 2000 && capped.truncated === true, '안전 상한에 걸리면 truncated=true로 알린다')
}


console.log('── ⑧ 성능: 상한을 풀었으면 계산량도 감당돼야 한다 ──')
{
  // v1.4.38에서 조회 절단을 고치자 문항이 1,000 → 4,432건이 됐고, 관제실이 그대로 **멈췄다**.
  // 집계가 날짜별로 여러 번 훑기 때문에 KST 날짜 변환이 40만 번 넘게 불리는데,
  // Intl 경유 변환은 호출당 수십 마이크로초라 10초가 넘는 정지가 됐다(L44 — 수정이 결함을 낳는다).
  const N = 5000
  const base = Date.parse(iso('2026-06-01T09:00:00'))
  const evs = Array.from({ length: N }, (_, i) => ({
    activity_type: 'quiz', is_correct: i % 3 !== 0, module_id: 'A1', response_ms: 3000,
    created_at: new Date(base + i * 90_000).toISOString(),
  }))
  const sess = Array.from({ length: 200 }, (_, i) => ({
    id: i, started_at: new Date(base + i * 3600_000).toISOString(),
    ended_at: new Date(base + i * 3600_000 + 600_000).toISOString(), duration_seconds: 600, device: 'mobile',
  }))
  const days = Array.from({ length: 40 }, (_, i) => A.addDays('2026-06-01', i))
  const t0 = process.hrtime.bigint()
  for (const d of days) A.studyTimeOfDay(evs, sess, d)
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  ok(ms < 1500, `문항 ${N}건 × 40일 집계가 1.5초 안에 끝난다 (관제실 멈춤 회귀 감시)`, `→ ${Math.round(ms)}ms`)
  // 결과가 옛 방식(Intl)과 한 글자도 다르면 안 된다 — 빨라지려고 날짜를 틀리면 아무 의미가 없다.
  let same = true
  for (let i = 0; i < 400; i++) {
    const t = new Date(base + i * 137_000).toISOString()
    if (A.kstDayOf(t) !== new Date(t).toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })) { same = false; break }
  }
  ok(same, 'KST 날짜 계산 결과가 Intl 방식과 완전히 일치한다')
}


console.log('── ⑨ 기기 분리: 아빠 PC 기록은 아이 지표가 아니다 (v1.4.40) ──')
{
  // 2026-08-16 실측: 세션 시간의 89.2%가 desktop, 문항도 85건이 desktop 세션에서 나왔다.
  // v1.4.37은 "섞여 있어요"라고 경고만 하고 숫자에서 빼지 않았다.
  const sessions = [
    { id: 1, started_at: iso('2026-08-16T09:00:00'), ended_at: iso('2026-08-16T09:30:00'), duration_seconds: 1800, device: 'mobile' },
    { id: 2, started_at: iso('2026-08-16T10:00:00'), ended_at: iso('2026-08-16T11:00:00'), duration_seconds: 3600, device: 'desktop' },
  ]
  const evs = [
    { session_id: 1, activity_type: 'quiz', is_correct: true, module_id: 'A1', response_ms: 3000, created_at: iso('2026-08-16T09:05:00') },
    { session_id: 2, activity_type: 'quiz', is_correct: true, module_id: 'A1', response_ms: 3000, created_at: iso('2026-08-16T10:05:00') },
    { session_id: null, activity_type: 'quiz', is_correct: true, module_id: 'A1', response_ms: 3000, created_at: iso('2026-08-16T09:06:00') },
  ]
  const ex = A.excludedSessionIds(sessions)
  ok(ex.has(2) && !ex.has(1), 'desktop 세션만 제외 대상')
  const kid = A.learnerEvents(evs, ex)
  ok(kid.length === 2, 'PC 문항은 빠지고 나머지는 남는다', `→ ${kid.length}`)
  ok(kid.some(e => e.session_id === null), 'session_id 없는 옛 기록은 버리지 않는다(과소 집계도 결함이다)')
  ok(A.learnerSessions(sessions).length === 1, 'desktop 세션은 세션 목록에서도 빠진다')
}

console.log('── ⑩ 출석: 세션 시간이 아니라 문항 기록으로 판정한다 (v1.4.40) ──')
{
  const mk = (day, n, spanSec, device, sid) => {
    const base = Date.parse(iso(`${day}T12:00:00`))
    const s = { id: sid, started_at: new Date(base).toISOString(), ended_at: new Date(base + spanSec * 1000).toISOString(), duration_seconds: spanSec, device }
    const e = Array.from({ length: n }, (_, k) => ({
      session_id: sid, activity_type: 'review', is_correct: true, module_id: 'A1', response_ms: 300,
      created_at: new Date(base + Math.round(spanSec * 1000 * k / Math.max(1, n - 1))).toISOString(),
    }))
    return [s, e]
  }
  // 2026-08-16 실측 재현
  const rows = [
    mk('2026-08-15', 376, 157, 'mobile', 1),   // 연타 세션 — 집중 4.1분 → 출석 아님
    mk('2026-08-14', 300, 5000, 'mobile', 2),  // 정상 → 출석
    mk('2026-08-13', 200, 1600, 'mobile', 3),  // 정상 → 출석
    mk('2026-08-11', 200, 1800, 'desktop', 4), // 아빠 PC → 출석 아님
  ]
  const sessions = rows.map(r => r[0])
  const events = rows.flatMap(r => r[1])
  const days = A.attendanceDays(events, sessions)
  ok(!days.includes('2026-08-15'), '★376문항을 157초에 넘긴 날은 출석이 아니다 (집중 4.1분)', `→ ${JSON.stringify(days)}`)
  ok(days.includes('2026-08-14') && days.includes('2026-08-13'), '정상 학습일은 출석으로 인정한다')
  ok(!days.includes('2026-08-11'), '아빠 PC(desktop)에서 푼 날은 아이 출석이 아니다')
  // 옛 규칙(세션 원본 합 ≥ 15분)이 되살아나면 8/15·8/11이 다시 들어온다 → 위 두 검사가 실패한다.
  ok(A.ATTENDANCE_RULE.needFocusSec === A.GOAL_SEC, '출석 기준 시간은 GOAL_SEC 하나뿐이다(숫자 복사 금지)')
  // 문항이 있어도 15분 미달이면 출석 아님
  const [s5, e5] = mk('2026-08-10', 30, 600, 'mobile', 5)
  ok(!A.attendanceDays(e5, [s5]).includes('2026-08-10'), '10분만 하면 출석이 아니다')
  // streak — 오늘 아직 안 했으면 어제까지의 연속을 살려 준다
  ok(A.streakFrom(['2026-08-13', '2026-08-14'], '2026-08-15') === 2, '오늘 미완이면 어제까지의 연속을 유지')
  ok(A.streakFrom(['2026-08-13', '2026-08-14'], '2026-08-16') === 0, '하루 건너뛰면 0 (내려가는 것도 정직하게)')
  ok(A.streakFrom(['2026-08-14', '2026-08-15', '2026-08-16'], '2026-08-16') === 3, '오늘까지 이어지면 그대로 센다')
}

console.log('── ⑪ 복습 무결성: 하루 상한 · 읽는 시간 · 버튼 섞기 (v1.4.40) ──')
{
  /* ★v1.4.46★ 하루 회계가 localStorage → 서버 권위 + 메모리 사본(dailyLedger)으로 옮겨졌다.
     그래서 가짜 localStorage를 갈아끼우는 것만으로는 카운터가 안 지워진다 —
     실제로 이 검사가 그 사실을 잡아 ⑪ 이후 블록이 전부 실패했다. 하네스를 맞춘다(L63-4). */
  writeFileSync('.verify/rev_entry.ts', `import * as RV from '../src/lib/review'\nimport { todayStr } from '../src/lib/leitner'\nimport { _resetLedger } from '../src/lib/dailyLedger'\n// @ts-ignore\nglobalThis.RV = { ...RV, todayStr, _resetLedger }\n`)
  execSync('/root/.bun/bin/bun build .verify/rev_entry.ts --outfile .verify/rev_bundle.js --target node', { stdio: 'inherit' })
  const store = {}
  globalThis.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: k => { delete store[k] },
  }
  await import('./.verify/rev_bundle.js')
  const RV = globalThis.RV
  const today = RV.todayStr()
  ok(RV.DAILY_MINE_CAP === 60, '하루 상한 60장 (Dio님 결정 2026-08-16)', `→ ${RV.DAILY_MINE_CAP}`)
  ok(RV.MIN_REVEAL_MS >= 600, '뒷면 읽는 시간 게이트가 있다', `→ ${RV.MIN_REVEAL_MS}ms`)
  const cards = Array.from({ length: 116 }, (_, i) => ({ id: i + 1, card_id: `c${i}`, due_date: today, box: 1 + (i % 4) }))
  const mine = RV.todaysMine(cards, today)
  ok(mine.length === 60, '★116장이 due여도 오늘 몫은 60장 (연타 유인 제거)', `→ ${mine.length}`)
  ok(mine.every((c, i, a) => i === 0 || a[i - 1].box <= c.box), '박스가 낮은 것(틀린 카드)부터 캔다')
  // 이미 캔 만큼 차감되지 않으면 상한이 아무 일도 하지 않는다 (입구로 돌아오면 다시 60장이 뜬다)
  for (const c of mine.slice(0, 60)) RV.addReviewDone(c.card_id)
  ok(RV.minedToday() === 60, '오늘 캔 카드 수를 센다')
  // ★v1.4.43★ 상한의 분모는 '오늘 채점 이벤트 수'(정·오답 모두). reviewDone(정답만)은 재채굴 차단 전용.
  for (let k = 0; k < 60; k++) RV.addGradedToday()
  ok(RV.todaysMine(cards, today).length === 0, '★상한을 다 쓰면 오늘은 더 못 캔다 (하루 상한이지 한 판 상한이 아니다)')
  // 버튼 좌우 섞기 — 첫 구현은 % 2(음수), 두 번째는 & 1(정확히 교대)로 둘 다 틀렸다.
  let ones = 0, alt = 0, n = 0
  for (let seed = 1; seed <= 300; seed++) {
    let prev = null
    for (let i = 0; i < 60; i++) {
      const v = RV.gradeSwapped(i, seed); n++; if (v) ones++
      if (prev !== null && v !== prev) alt++
      prev = v
    }
  }
  const onesPct = 100 * ones / n, altPct = 100 * alt / (n - 300)
  ok(onesPct > 45 && onesPct < 55, '좌우가 한쪽으로 쏠리지 않는다', `→ ${onesPct.toFixed(1)}%`)
  ok(altPct > 42 && altPct < 58, '★규칙적으로 교대하지 않는다 (& 1 회귀 감시)', `→ 연속 교대 ${altPct.toFixed(1)}%`)
  delete globalThis.localStorage
}

console.log('── ⑫ 오프라인 큐: 재시도해야 할 실패를 버리지 않는다 (v1.4.40) ──')
{
  writeFileSync('.verify/store_entry.ts', `import { isPermanentFailure } from '../src/lib/store'\n// @ts-ignore\nglobalThis.PF = isPermanentFailure\n`)
  execSync('/root/.bun/bin/bun build .verify/store_entry.ts --outfile .verify/store_bundle.js --target node', { stdio: 'inherit' })
  const store2 = {}
  globalThis.localStorage = { getItem: k => (k in store2 ? store2[k] : null), setItem: (k, v) => { store2[k] = String(v) }, removeItem: k => { delete store2[k] } }
  globalThis.window = undefined
  await import('./.verify/store_bundle.js')
  const PF = globalThis.PF
  for (const c of [400, 404, 409]) ok(PF(new Error(`supabase ${c}: x`)) === true, `${c}는 재시도해도 소용없다 → 버린다`)
  for (const c of [401, 403, 408, 429, 500, 503]) ok(PF(new Error(`supabase ${c}: x`)) === false, `★${c}는 반드시 재시도한다 (학습 기록 영구 삭제 회귀 감시)`)
  ok(PF(new TypeError('Failed to fetch')) === false, '네트워크 오류는 재시도한다')
  delete globalThis.localStorage
}

console.log('── ⑬ 진단 패널: 죽은 신호 · 오문구 · 속도 감지 (v1.4.40) ──')
{
  const base = { today: { focusSec: 900, openSec: 900, rawSessionSec: 900, answers: 30, idleSuspect: false, corruptSessions: 0, devices: ['mobile'] },
    week: [], xp: { derived: 100, stored: 100, diff: 0, diffPct: 0, truncated: false },
    progress: { total: 52, done: 28, pct: 54, baseDone: 28, baseTotal: 28, extDone: 0, extTotal: 24, extOpen: true },
    debt: { due: 0, overdue: 0, today: 0, oldestOverdueDays: 0, pacePerDay: 0, daysToClear: null, overCapacity: false },
    badgeOnlyInAdmin: [], badgeOnlyInApp: [], eventsTruncated: false, sessionsTruncated: false, failedTables: [], extTouched: true }
  // ★죽은 신호★ v1.4.37~39에서 sessionsTruncated는 선언·전달됐지만 아무도 읽지 않았다.
  const trunc = A.integrityCheck({ ...base, sessionsTruncated: true })
  ok(trunc.some(i => i.id === 'sessions_truncated'), '★세션 조회 절단을 실제로 알린다 (죽은 신호 회귀 감시)')
  // ★오문구★ overdue=0인데 "그중 0장은 기한이 지났고, 가장 오래된 건 0일 지났습니다"가 뜨던 자리
  const heavy = A.integrityCheck({ ...base, debt: { due: 116, overdue: 0, today: 116, oldestOverdueDays: 0, pacePerDay: 204, daysToClear: 1, overCapacity: true } })
  const txt = heavy.map(i => `${i.title} ${i.detail}`).join(' ')
  ok(!/0장은 기한이 지났/.test(txt) && !/0일 지났/.test(txt), '★"0장·0일" 문장을 만들지 않는다', `→ ${txt.slice(0, 80)}`)
  ok(!/밀렸어요/.test(txt), '기한이 지나지 않은 오늘 몫을 "밀렸다"고 부르지 않는다')
  // ★속도 감지★ 이 검사가 없어서 246ms 연타를 몇 주 놓쳤다
  const fast = A.integrityCheck({ ...base, acc7: { newTotal: 100, newCorrect: 79, newPct: 79, reviewTotal: 2026, reviewCorrect: 2023, reviewPct: 100, excluded: 0, blendedPct: 89, reviewFast: 1844, reviewFastPct: 91 } })
  ok(fast.some(i => i.id === 'review_too_fast'), '★복습을 1초 안에 넘기면 경고한다 (SRS 무력화 감지)')
  const slow = A.integrityCheck({ ...base, acc7: { newTotal: 100, newCorrect: 79, newPct: 79, reviewTotal: 100, reviewCorrect: 90, reviewPct: 90, excluded: 0, blendedPct: 85, reviewFast: 5, reviewFastPct: 5 } })
  ok(!slow.some(i => i.id === 'review_too_fast'), '정상 속도면 아무 말도 하지 않는다(경보 피로 방지)')
  // 확장 월드 — 기록이 있으면 "한 번도 안 들어갔어요"라고 말하지 않는다
  ok(!A.integrityCheck({ ...base, extTouched: true }).some(i => i.id === 'ext_untouched'), '기록이 있으면 "한 번도 안 들어갔다"고 하지 않는다')
  ok(A.integrityCheck({ ...base, extTouched: false }).some(i => i.id === 'ext_untouched'), '정말 기록이 없으면 알려 준다')
}

console.log('── ⑭ ★소비자 검사★: 라이브러리만 고치고 화면을 두면 갈라진다 (L51) ──')
{
  // 2026-08-16 독립 교차 검증의 핵심 발견: 41항목 전부가 adminMetrics.ts와 supabase.ts만 봤고
  // AdminPage.tsx(1,733줄)를 import하는 항목이 **0개**였다. 그래서 화면 안의 규칙 위반 9건이
  // "41/41 통과" 상태로 살아 있었다. 이제 소스를 직접 읽어 금지 패턴을 막는다.
  // 주석은 제거하고 본다 — 이 릴리스에서 '옛 결함 코드를 주석에 인용'한 것을 탐지기가 잡았다(내 실수).
  const src = f => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const admin = src('src/screens/AdminPage.tsx')
  const storeSrc = src('src/lib/store.ts')
  const supa = src('src/lib/supabase.ts')

  ok(!/Math\.max\([^)]*learner\?\.xp/.test(admin), '★관제실 누적 XP에 Math.max가 없다 (가림막 회귀 감시)')
  ok(/isNewLearning\(/.test(admin), '취약 영역·마스터리가 신규 학습 판정을 쓴다')
  // ★2026-08-16 독립 감사가 뚫은 자리★ 아래 두 호출을 지워도 71/71이 통과했다.
  //   "규칙 함수가 존재하는가"가 아니라 "화면이 그 함수를 **실제로 부르는가**"를 본다.
  ok(/events = learnerEvents\(/.test(admin) && /sessions = learnerSessions\(/.test(admin),
    '★관제실이 기기 분리를 실제로 적용한다 (호출 삭제 회귀 감시)')
  ok(/excludedSessionIds\(/.test(admin), '관제실이 제외 세션 집합을 만든다')
  ok(/todaysMine\(/.test(src('src/screens/ReviewMine.tsx')),
    '★복습 광산이 하루 상한 함수를 실제로 부른다 (minableCards 회귀 감시)')
  ok(!/db\.select\('answer_events'/.test(admin), '★관제실이 answer_events를 selectAll 없이 조회하지 않는다 (문제 다시보기 절단 회귀 감시)')
  ok(!/db\.select\('answer_events'/.test(supa) && !/db\.select\('sessions'/.test(supa), '가족 대시보드도 selectAll을 쓴다')
  ok(!/duration_seconds \|\| 0\) \/ 60/.test(supa), '★가족 대시보드가 세션 원본 시간을 "오늘 N분"으로 쓰지 않는다')
  ok(/attendanceDays\(/.test(storeSrc), '학습자 앱이 출석 판정을 adminMetrics에서 가져온다')
  ok(!/secByDay\[k\] \+= /.test(storeSrc) && !/secByDay\[k\] \|\| 0\) \+ \(se\.duration_seconds/.test(storeSrc),
    '★학습자 앱이 세션 원본 시간을 날짜별로 합쳐 출석을 판정하지 않는다 (거짓 출석 회귀 감시)')
  ok(!/serverTodaySec > getDailyActiveSec\(\)/.test(storeSrc), '★DAILY_KEY를 서버 세션 합으로 덮어쓰지 않는다 (L45 규칙4 회귀 감시)')
  ok(/todaysMine\(/.test(src('src/App.tsx')), '하단 네비 뱃지가 광산과 같은 함수를 쓴다')
  ok(!/db\.select\('review_cards'/.test(src('src/App.tsx')), '네비 뱃지 조회도 selectAll이다')
  ok(/onLearnerRouteRef/.test(src('src/App.tsx')), '하트비트가 현재 화면을 본다(마운트 시 1회가 아니라)')

  // 남아 있는 `db.select(... limit=` 지점을 전수로 보고한다 (query_check 대체)
  //
  // ★2026-08-16 (v1.4.41) 왜 파일 목록을 손으로 적지 않게 바꿨나★
  //   v1.4.40에서 이 목록에 `WorldMap.tsx`가 빠져 있었다. 그래서 U-3(마이너스 표기 제거)를
  //   Profile.tsx에서만 고치고 월드맵을 놓쳤고, 배포된 라이브 화면에 **"다음 레벨 -1331"**이
  //   그대로 남았다 — 소비자 검사를 만들면서 소비자 목록을 손으로 적어 **L51을 내가 재발시킨 것**이다.
  //   목록은 이제 폴더에서 읽는다. 화면이 새로 생기면 자동으로 검사 대상이 된다.
  const learnerScreens = readdirSync('src/screens')
    .filter(f => f.endsWith('.tsx'))
    .filter(f => !/^(Admin|SuperConsole|FamilyDashboard|DiagnosticRun)/.test(f))  // 아빠 화면은 제외
    .map(f => `src/screens/${f}`)
  const scanned = ['src/App.tsx', 'src/lib/store.ts', 'src/lib/supabase.ts',
                   'src/screens/AdminPage.tsx', ...learnerScreens]

  const risky = []
  for (const f of scanned) {
    src(f).split('\n').forEach((line, i) => {
      if (/db\.select\(/.test(line) && /limit=\$?\{?\d{4,}/.test(line)) risky.push(`${f}:${i + 1}`)
    })
  }
  ok(risky.length === 0, '1,000행을 넘길 수 있는 db.select(limit=)가 남아 있지 않다', `→ ${risky.join(', ')}`)

  // ★아이가 보는 화면에 마이너스 숫자를 쓰지 않는다 (U-3 전수 감시, v1.4.41)★
  //   "남은 XP"를 -1331로 쓰면 초6은 '잃었다'로 읽는다. 남은 양은 항상 양수로 말한다.
  //   패턴: JSX 안에서 `-{...}` 로 시작하는 값 출력 (문자열 리터럴 안의 하이픈은 걸리지 않는다).
  const minus = []
  for (const f of learnerScreens) {
    src(f).split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return                       // 주석 줄은 건너뛴다
      if (/>[^<>]*-\{/.test(line) || /}\s*-\{/.test(line)) minus.push(`${f}:${i + 1}`)
    })
  }
  ok(minus.length === 0, '★아이 화면에 "-{숫자}" 표기가 없다 (U-3 회귀 감시 · 학습자 화면 전수)',
    `→ ${minus.join(', ')}`)

  // ★v1.4.43 (C3)★ 위 정규식은 **JSX형 `-{...}`만** 봤다. 그래서 v1.4.42의 RewardBoard.tsx:178
  //   `` `-${st.remaining.toLocaleString()}` `` (템플릿 리터럴형)은 통과했고,
  //   보상 사다리에 「-5,431」이 그대로 나갔다. L51의 정규식 판(版) — 소비자 목록은 자동화했는데
  //   **탐지 패턴을 손으로 적어** 문법 하나 다른 세 번째 형태에서 뚫렸다. 두 형태를 모두 본다.
  const minusTpl = []
  for (const f of learnerScreens) {
    src(f).split('\n').forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return
      if (/`-\$\{/.test(line)) minusTpl.push(`${f}:${i + 1}`)
    })
  }
  ok(minusTpl.length === 0, '★아이 화면에 "`-${숫자}`" 템플릿 리터럴 음수가 없다 (C3 — v1.4.42 유출 형태)',
    `→ ${minusTpl.join(', ')}`)
}

console.log('── ⑭-b ★v1.4.43 신규 봉인 (C2 · C4 · N1 · N2)★ ──')
{
  // 주석은 제거하고 본다 — 이 릴리스에서 '옛 결함 코드를 주석에 인용'한 것을 탐지기가 잡았다(내 실수).
  const src = f => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const admin = src('src/screens/AdminPage.tsx')
  // C2 — 월드 번호를 손으로 적지 않는다. EXT_WORLDS(단일 원천)에서 파생해야 한다.
  ok(!/world:\s*10\b/.test(admin), '★관제실에 존재하지 않는 월드 10이 하드코딩돼 있지 않다 (C2)')
  ok(/EXT_WORLDS\.map\(/.test(admin), '★심화 과정 패널이 EXT_WORLDS에서 파생된다 (상수 복사 금지 · C2)')

  // C4 — 조회 실패를 빈 목록으로 삼키면 "오늘 할 일 없음"이라고 거짓말한다.
  const rm = src('src/screens/ReviewMine.tsx')
  ok(!/\.catch\(\s*\(\)\s*=>\s*setAll\(\[\]\)\s*\)/.test(rm),
    '★복습 조회 실패를 빈 배열로 삼키지 않는다 (C4)')
  ok(/setLoadError\(true\)/.test(rm) && /다시 시도/.test(rm),
    '★복습 조회 실패 시 오류 상태와 재시도 수단이 있다 (C4)')
  const pf = src('src/screens/Profile.tsx')
  ok(/badgeStale/.test(pf) && /wordcraft_badges_cache_v1/.test(pf),
    '★뱃지 조회 실패를 캐시 + 안내로 처리한다 (0/71 거짓 표시 금지 · C4)')

  // N1 — 같은 날 같은 문항 반복 정답이 XP를 만들지 않는다.
  const la = src('src/screens/ListenArcade.tsx')
  // ★L51 재적용 (2026-08-18 결함 주입에서 내가 걸렸다)★ `markArcadeXp(` 존재 검사는
  //   **함수 정의**에도 걸린다 — 호출부를 통째로 지워도 통과했다. 소비자(호출) 쪽을 본다.
  ok(/wordcraft_arcade_xp_v1/.test(la), '★소리 훈련소가 오늘 XP 지급 이력을 저장한다 (N1)')
  ok(/r\.correct && xpNow > 0\) markArcadeXp\(/.test(la),
    '★정답 시 XP 지급 이력을 실제로 **기록한다** (호출부 검사 — 같은 날 재적립 차단 · N1)')
  ok(/xp: gained/.test(la) && /const gained = r\.correct \? xpNow : 0/.test(la),
    '★기록되는 XP가 xpNow(0일 수 있음)를 그대로 쓴다 (N1 — 고정 10 금지)')
  ok(/-r\$\{round\}/.test(la), '★라운드 시드에 라운드 번호가 들어간다 (판마다 새 문항 · N1)')
  ok(/xpForCorrect/.test(la) && /xpForCorrect/.test(src('src/engine/QuestionCard.tsx')),
    '★XP가 0일 때 화면이 "+10 XP"라고 말하지 않는다 (N1)')

  // N2 — 앞면에서 소리를 들을 수 있어야 인출 연습이 성립한다.
  ok(/flash-listen/.test(rm), '★복습 카드 앞면에 다시 듣기 버튼이 있다 (N2)')
  // ★v1.4.45 (N2 봉합의 봉합 · 2026-08-18 격리 실기 검증)★ 렌더러만 고치면 소용없다 —
  //   `W:CMD:*`/`W:ECHO:*` 카드는 모듈 콘텐츠가 아니라 listening 에서 나오므로,
  //   backsMap 을 모듈에서만 채우면 **정작 그 17장에만 음성이 안 붙는다.** 공급 쪽을 잠근다.
  const appx = src('src/App.tsx')
  ok(/loadListening\(\)/.test(appx) && /W:CMD:\$\{/.test(appx) && /W:ECHO:\$\{/.test(appx),
    '★backsMap이 지령·에코 카드(W:CMD/W:ECHO)의 음성을 실제로 공급한다 (N2 — 렌더러가 아니라 데이터)')
  // ★v1.4.43-b (AUDIT 지적)★ 실제 하루 최대는 cap + RESPAWN_EXTRA 다. 화면이 "60장까지만"이라고
  //   말하면 그것이 곧 거짓말이 된다 — 문구가 추가 몫을 함께 말하는지 잠근다.
  ok(!/{DAILY_MINE_CAP}장<\/b>까지만/.test(rm),
    '★"60장까지만"이라고 단정하지 않는다 (실제 상한은 cap+리스폰 추가분)')
  ok(/DAILY_RESPAWN_EXTRA/.test(rm),
    '★입구 문구가 리스폰 추가 몫을 함께 말한다 (화면과 코드의 상한이 같다)')
  ok(/phase !== 'mining' \|\| flipped/.test(rm), '★카드 등장 시 앞면 음성을 자동 재생한다 (N2)')

  // ★독립 감사 2026-08-17★ C6 이후 addGradedToday()가 상한의 분모다 —
  //   더블탭으로 한 번의 채점이 두 번 세지면 아이가 30장만 보고 60장을 쓴 것이 된다.
  //   (answer_events 중복 기록 = 무삭제 테이블 오염이기도 하다.)
  ok(/gradingRef\.current === i\) return/.test(rm) && /gradingRef\.current = i/.test(rm),
    '★채점 버튼 더블탭 가드가 있다 (예산 과다 소진 · answer_events 중복 방지)')
  ok(/gradingRef\.current = -1/.test(rm), '★다음 카드로 넘어갈 때 채점 가드가 풀린다')
  ok(/myTick !== reqRef\.current/.test(rm), '★재시도 연타 시 옛 응답이 새 결과를 덮지 않는다 (C4)')
  ok(/badgeCacheKey\(/.test(pf) && /learnerId/.test(pf),
    '★뱃지 캐시가 학습자별로 스코프된다 (형제 전환 시 캐시 오염 방지)')
}

console.log('── ⑮ 성능: 날짜별 집계가 O(날짜 × 문항)이 아니다 (v1.4.40) ──')
{
  // 2026-08-16 실측: 예전 daySecFromEvents는 날짜마다 events 전수 스캔 + studyTimeOfDay(내부 2회 전수 필터).
  // 4,445문항 × 35일에서 dayAgg+week7만 544ms였고, 비용이 날짜수 × 문항수라 120일이면 제곱으로 늘어난다.
  const N = 12000, DAYS = 120
  const base = Date.parse(iso('2026-04-01T09:00:00'))
  const evs = Array.from({ length: N }, (_, i) => ({ created_at: new Date(base + i * 700_000).toISOString() }))
  const t0 = process.hrtime.bigint()
  const tsByDay = new Map()
  for (const e of evs) {
    const t = Date.parse(e.created_at)
    const k = A.kstDayOf(e.created_at)
    const arr = tsByDay.get(k); if (arr) arr.push(t); else tsByDay.set(k, [t])
  }
  for (const arr of tsByDay.values()) arr.sort((a, b) => a - b)
  let sum = 0
  for (const k of tsByDay.keys()) sum += A.focusSecOfTimestamps(tsByDay.get(k))
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  ok(ms < 300, `문항 ${N}건 × ${DAYS}일 색인 집계가 300ms 안에 끝난다`, `→ ${Math.round(ms)}ms`)
  ok(sum > 0, '집계 결과가 실제로 나온다')
}



console.log('── ⑯ 독립 감사(2026-08-16)가 잡은 결함의 회귀 감시 (v1.4.40-b) ──')
{
  ok(A.FAST_REVIEW_MS > 900, '★복습 속도 임계값이 읽기 게이트(900ms)보다 크다 (자기 게이트로 즉사 회귀 감시)', `→ ${A.FAST_REVIEW_MS}ms`)
  ok(A.FAST_REVIEW_MS >= 1200 && A.FAST_REVIEW_MS <= 2000, '임계값이 실측 연타 하한(1,177ms)을 잡는 범위에 있다', `→ ${A.FAST_REVIEW_MS}`)

  const store3 = {}
  globalThis.localStorage = { getItem: k => (k in store3 ? store3[k] : null), setItem: (k, v) => { store3[k] = String(v) }, removeItem: k => { delete store3[k] } }
  const RV = globalThis.RV
  RV._resetLedger()   // ★v1.4.46★ 저장소를 갈아끼웠으면 회계 메모리도 함께 초기화한다
  const today = RV.todayStr()
  const normal = Array.from({ length: 80 }, (_, i) => ({ id: 100 + i, card_id: `n${i}`, due_date: today, box: 3, last_result: true }))
  const respawn = Array.from({ length: 10 }, (_, i) => ({ id: 900 + i, card_id: `w${i}`, due_date: today, box: 1, last_result: false }))
  const fresh = Array.from({ length: 5 }, (_, i) => ({ id: 800 + i, card_id: `f${i}`, due_date: today, box: 1, last_result: null }))
  // ★v1.4.43 (C6)★ 계약이 바뀌었다. 예전엔 "리스폰은 상한을 넘는다"였고, 그 결과
  //   2026-08-17 실사용에서 「헷갈려」 23회가 오늘 몫을 60 → 106회로 늘렸다(정직 처벌).
  //   이제 리스폰은 상한 **안**에서 **맨 앞자리**를 차지한다 — 약속은 지키고 총량은 안 늘린다.
  const mine = RV.todaysMine([...normal, ...respawn, ...fresh], today)
  ok(mine.length === 60, '★리스폰이 섞여도 오늘 몫은 60장을 넘지 않는다', `→ ${mine.length}장`)
  ok(mine.slice(0, 10).every(c => c.card_id.startsWith('w')),
    '★오늘 틀린 카드 10장이 오늘 몫의 맨 앞에 온다 (당일 리스폰 약속)')
  for (let i = 0; i < 30; i++) RV.addGradedToday()
  const after = RV.todaysMine([...normal, ...respawn, ...fresh], today)
  ok(after.length === 30, '★채점 30회 뒤 남은 몫은 30장 — 오답을 눌러도 늘지 않는다', `→ ${after.length}장`)
  // ★독립 감사 2026-08-17 회귀 봉인★ 상한을 다 써도 '오늘 새로 틀린 카드'는 별도 몫으로 나온다.
  for (let i = 0; i < 30; i++) RV.addGradedToday()   // 총 60회 = 상한 소진
  ok(RV.todaysMine(normal, today).length === 0, '상한 소진 후 일반 카드는 안 나온다')
  ok(RV.todaysMine([...normal, ...respawn], today).length === Math.min(10, RV.DAILY_RESPAWN_EXTRA),
    '★상한 소진 후에도 오늘 틀린 카드는 별도 몫으로 나온다 ("내일 리젠" 거짓말 방지)')
  delete globalThis.localStorage
}
{
  const storeSrc = readFileSync('src/lib/store.ts', 'utf8')
  ok(/repairStreak\(s: LocalState, trusted = false\)/.test(storeSrc),
    '★repairStreak이 신뢰 플래그를 받는다 (조회 실패로 streak을 0으로 덮어쓰던 회귀 감시)')
  ok(/if \(run < s\.streak_days && !trusted\)/.test(storeSrc), '신뢰할 수 없으면 내리지 않는다')
  ok(/created_at: new Date\(\)\.toISOString\(\)/.test(storeSrc),
    '★문항에 클라이언트 시각을 실어 보낸다 (오프라인 학습이 한 시각으로 뭉개지던 회귀 감시)')
  ok(/unsyncedLocal/.test(storeSrc), '서버가 모르는 날의 로컬 출석은 지우지 않는다')
  ok(/if \(!flushing && item\.kind === 'update'/.test(storeSrc), '★flush 중에는 큐 병합을 하지 않는다 (마지막 갱신 유실 회귀 감시)')
  ok(/FLUSH_CHUNK/.test(storeSrc), '★큐 flush가 묶음 처리다 (O(n²) 회귀 감시)')
  ok(/tickSession\(false, true\)/.test(storeSrc), '백그라운드 전환 저장이 오프라인 큐를 탄다')
  const appSrc = readFileSync('src/App.tsx', 'utf8')
  ok(/repairStreak\(s, sync\.ok && sync\.eventsSeen > 0\)/.test(appSrc), '앱이 조회 성공 여부를 넘긴다')
  ok(/SESSION_LIMIT = 20000/.test(readFileSync('src/screens/AdminPage.tsx', 'utf8')),
    '★세션 조회 상한이 기기 분리를 감당한다 (400 회귀 감시)')
}


console.log(fail === 0 ? '\n✅ admin_check 통과' : `\n❌ admin_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
