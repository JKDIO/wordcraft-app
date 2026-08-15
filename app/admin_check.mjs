/** admin_check.mjs — 관제실 지표 회귀 봉인 (v1.4.35 신설)
 *
 * 검사 대상은 "코드가 컴파일되는가"가 아니라 **2026-08-15에 실제로 일어난 거짓말이 되살아나는가**다.
 * 그래서 모든 케이스는 라이브 DB에서 실측한 값을 그대로 쓴다.
 *
 * 실행: node admin_check.mjs   (verify.sh에서 부른다)
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

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

console.log(fail === 0 ? '\n✅ admin_check 통과' : `\n❌ admin_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
