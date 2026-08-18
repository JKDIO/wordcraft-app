/** review_check.mjs — 복습 광산: 뱃지 숫자 = 광산 숫자 (v1.4.29 사고 봉인)
 *
 * ★왜★ 2026-08-14 P0 사고: 같은 "오늘 캘 카드"를 두 곳이 다르게 계산해
 *   하단 네비 뱃지엔 40이 떠 있는데 광산은 "오늘 캘 카드가 없어"라고 말했다.
 *   그날 모험에서 틀린 38문제를 아이가 다시 만날 수 없었다.
 *   2026-08-16에는 여기에 **하루 상한**이 추가됐다 — 상한을 한쪽에만 넣으면 같은 사고가 재현된다.
 *
 * ★2026-08-16 재작성★ `verify.sh`가 부르는데 저장소·노트북 어디에도 없었다.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/rv_entry.ts', `import * as RV from '../src/lib/review'\nimport * as L from '../src/lib/leitner'\n// @ts-ignore\nglobalThis.RV = RV; globalThis.L = L\n`)
execSync('/root/.bun/bin/bun build .verify/rv_entry.ts --outfile .verify/rv_bundle.js --target node', { stdio: 'inherit' })
const mem = {}
globalThis.localStorage = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v) }, removeItem: k => { delete mem[k] } }
await import('./.verify/rv_bundle.js')
const RV = globalThis.RV, L = globalThis.L
const today = L.todayStr()

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const src = f => strip(readFileSync(f, 'utf8'))
const card = (i, o = {}) => ({ id: 1000 + i, card_id: `c${i}`, card_front: `f${i}`, box: 3, due_date: today, review_count: 1, last_result: true, ...o })

console.log('── ① 조회 규칙 (서버가 due를 거른다 · 정렬 필수) ──')
{
  const q = RV.dueCardsQuery('LID')
  ok(q.includes('learner_id=eq.LID'), '학습자로 거른다')
  ok(q.includes(`due_date=lte.${today}`), '★due를 서버에서 거른다 (화면에서 고르지 않는다)')
  ok(/order=/.test(q), '★정렬이 있다 — 없으면 페이지 경계에서 행이 중복·유실된다(L31)')
  ok(q.includes('box.asc'), '박스 낮은 것(틀린 카드)부터')
  ok(q.includes('last_result'), '리스폰 판정에 필요한 last_result를 받는다')
  ok(/order=/.test(RV.boxTotalsQuery('LID')), '층별 집계 조회에도 정렬이 있다')
}

console.log('── ② 오늘 캘 카드 = 단일 함수 ──')
{
  const rows = [card(1), card(2), card(3, { due_date: '2099-01-01' })]
  ok(RV.minableCards(rows, today).length === 2, '미래 due 카드는 오늘 안 나온다')
  RV.addReviewDone('c1')
  ok(RV.minableCards(rows, today).length === 1, '오늘 이미 맞힌 카드는 다시 안 나온다 (당일 재채굴·XP 파밍 차단)')
  ok(RV.minedToday() === 1, '오늘 캔 카드 수를 센다')
  for (const k of Object.keys(mem)) delete mem[k]
}

console.log('── ③ ★하루 상한 (2026-08-16 신설)★ ──')
{
  ok(RV.DAILY_MINE_CAP === 60, `하루 상한 ${RV.DAILY_MINE_CAP}장 (Dio님 결정)`)
  ok(RV.MIN_REVEAL_MS >= 600, `뒷면 읽는 시간 게이트 ${RV.MIN_REVEAL_MS}ms`)
  const many = Array.from({ length: 116 }, (_, i) => card(i, { box: 2 + (i % 3) }))
  ok(RV.todaysMine(many, today).length === 60, '★116장이 due여도 오늘 몫은 60장')
  const m = RV.todaysMine(many, today)
  ok(m.every((c, i, a) => i === 0 || (a[i - 1].box ?? 1) <= (c.box ?? 1)), '박스가 낮은 것부터 캔다')
  // ★v1.4.43★ 상한의 분모는 '채점 이벤트 수'다 — 정답이든 오답이든 1회는 1회.
  for (let k = 0; k < 60; k++) RV.addGradedToday()
  ok(RV.gradedToday() === 60, '오늘 채점 횟수를 센다 (정·오답 모두)')
  ok(RV.todaysMine(many, today).length === 0, '★상한을 다 쓰면 오늘은 더 못 캔다 (한 판 상한이 아니라 하루 상한)')
  for (const k of Object.keys(mem)) delete mem[k]
}

console.log('── ③-b ★C6 역인센티브 봉인 (2026-08-17 실사용 사고)★ ──')
{
  // 실사고: 오답 리스폰이 상한 밖이라 「헷갈려」 23회가 오늘 몫을 60 → 106회로 늘렸다.
  //   "정직하게 모른다고 할수록 할 일이 늘어난다" = 헌법 §3-3 위반. 이 검사가 그 재발을 막는다.
  const many = Array.from({ length: 116 }, (_, i) => card(i, { box: 2 + (i % 3) }))
  const respawn = Array.from({ length: 30 }, (_, i) => card(500 + i, { box: 1, last_result: false }))
  const fresh = Array.from({ length: 4 }, (_, i) => card(700 + i, { box: 1, last_result: null }))
  const pool = [...many, ...respawn, ...fresh]

  const first = RV.todaysMine(pool, today)
  ok(first.length === 60, '★리스폰이 섞여 있어도 오늘 몫은 정확히 60장', `→ ${first.length}장`)
  ok(first.slice(0, 30).every(c => c.last_result === false),
    '★틀린 카드가 오늘 몫의 맨 앞자리를 차지한다 (약속은 지키되 총량은 안 늘린다)')
  ok(!first.some(c => c.last_result === null && (c.box ?? 1) === 1) || first.length === 60,
    '새로 시드된 박스1 카드가 상한을 우회하지 않는다')

  // 오답만 30번 채점 → 남은 몫은 30장이어야 한다 (늘어나면 역인센티브 재발)
  for (let k = 0; k < 30; k++) RV.addGradedToday()
  const after = RV.todaysMine(pool, today)
  ok(after.length === 30, '★「헷갈려」 30번을 눌러도 오늘 몫이 늘지 않는다 (30장 남음)', `→ ${after.length}장`)

  for (const k of Object.keys(mem)) delete mem[k]
}

console.log('── ③-c ★상한 소진 뒤에도 오늘 틀린 카드는 만난다 (독립 감사 2026-08-17 회귀 봉인)★ ──')
{
  // 감사가 잡은 회귀: budget=0이면 slice(0,0)이 리스폰까지 통째로 잘라, 오후 모험에서 틀린 카드가
  //   오늘 안 나오고 화면이 "내일 리젠돼"라고 거짓말했다. 그 시나리오를 그대로 재현해 못 박는다.
  const normal = Array.from({ length: 80 }, (_, i) => card(i, { box: 3 }))
  for (let k = 0; k < 60; k++) RV.addGradedToday()            // 아침에 상한 소진 (전부 정답)
  ok(RV.todaysMine(normal, today).length === 0, '상한을 다 쓰면 일반 카드는 더 안 나온다')

  // 오후 모험에서 5문제 틀림 → 박스1 · last_result=false · due=오늘
  const newWrong = Array.from({ length: 5 }, (_, i) => card(900 + i, { box: 1, last_result: false }))
  const after = RV.todaysMine([...normal, ...newWrong], today)
  ok(after.length === 5 && after.every(c => c.last_result === false),
    '★상한 소진 뒤에도 오늘 새로 틀린 카드는 전부 나온다 (당일 리스폰 약속)', `→ ${after.length}장`)
  ok(!after.some(c => (c.box ?? 1) !== 1), '별도 몫에는 리스폰만 들어간다 (일반 카드 우회 금지)')

  // 별도 몫도 하루 총량으로 못 박힌다 — 무한 루프 금지
  const many = Array.from({ length: 40 }, (_, i) => card(950 + i, { box: 1, last_result: false }))
  ok(RV.todaysMine([...normal, ...many], today).length === RV.DAILY_RESPAWN_EXTRA,
    `★별도 몫은 ${RV.DAILY_RESPAWN_EXTRA}장이 상한 (리스폰 무한 루프 금지)`)
  for (let k = 0; k < RV.DAILY_RESPAWN_EXTRA; k++) RV.addGradedToday()
  ok(RV.todaysMine([...normal, ...many], today).length === 0,
    '★별도 몫까지 다 쓰면 오늘은 정말 끝 — 「헷갈려」로 되돌아와도 다시 늘지 않는다')
  ok(RV.gradedToday() === 60 + RV.DAILY_RESPAWN_EXTRA,
    `하루 채점 총량 상한 ${60 + RV.DAILY_RESPAWN_EXTRA}회`, `→ ${RV.gradedToday()}`)
  for (const k of Object.keys(mem)) delete mem[k]
}

console.log('── ④ 라이트너 주기 ──')
{
  ok(L.BOX_INTERVALS.length === 6, '박스 0~5 주기표')
  const up = L.nextDue(1, true), down = L.nextDue(4, false)
  ok(up.box === 2, '정답이면 다음 박스로')
  ok(down.box === 1, '★오답이면 무조건 박스1 (리스폰)')
  ok(L.nextDue(5, true).box === 5, '박스5가 상한')
  ok(L.nextDue(1, false).due_date === today, '오답 카드는 오늘 다시 만난다')
}

console.log('── ⑤ ★뱃지 숫자와 광산 숫자가 같은 함수를 쓰는가 (2026-08-14 사고 봉인)★ ──')
{
  const app = src('src/App.tsx'), mine = src('src/screens/ReviewMine.tsx')
  ok(/todaysMine\(/.test(app), '★하단 네비 뱃지가 todaysMine을 쓴다')
  ok(/todaysMine\(/.test(mine), '★복습 광산이 todaysMine을 쓴다')
  ok(/dueCardsQuery\(/.test(app) && /dueCardsQuery\(/.test(mine), '둘 다 같은 조회식을 쓴다')
  ok(!/due_date=lte/.test(app) && !/due_date=lte/.test(mine), '★화면이 조회식을 직접 짜지 않는다 (규칙 복사 금지 — L27)')
  ok(/selectAll\('review_cards'/.test(app) && /selectAll\('review_cards'/.test(mine),
    '★둘 다 selectAll — 한쪽만 절단되면 숫자가 갈라진다(L49)')
  ok(/MIN_REVEAL_MS/.test(mine), '읽기 게이트를 화면이 실제로 쓴다')
  ok(/gradeSwapped\(/.test(mine), '버튼 좌우 섞기를 화면이 실제로 쓴다')
}

console.log(fail === 0 ? '\n✅ review_check 통과' : `\n❌ review_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
