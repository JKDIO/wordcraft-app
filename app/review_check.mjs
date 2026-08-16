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
  for (const c of m) RV.addReviewDone(c.card_id)
  ok(RV.todaysMine(many, today).length === 0, '★상한을 다 쓰면 오늘은 더 못 캔다 (한 판 상한이 아니라 하루 상한)')
  // 리스폰은 상한을 넘는다 — "틀린 문제는 그날 복습으로"라는 약속
  const respawn = Array.from({ length: 7 }, (_, i) => card(500 + i, { box: 1, last_result: false }))
  const fresh = Array.from({ length: 4 }, (_, i) => card(700 + i, { box: 1, last_result: null }))
  const after = RV.todaysMine([...many, ...respawn, ...fresh], today)
  ok(after.length === 7 && after.every(c => c.last_result === false),
    '★상한 소진 후에도 오늘 틀린 카드는 전부 나온다 (당일 리스폰 약속)', `→ ${after.length}장`)
  ok(!after.some(c => c.last_result === null), '새로 시드된 박스1 카드는 상한을 우회하지 않는다')
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
