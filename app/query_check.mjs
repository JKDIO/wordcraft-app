/** query_check.mjs — 서버 조회 안전: 상한·정렬·페이지네이션 (L31·L49)
 *
 * ★왜★ 이 프로젝트가 같은 사고를 세 번 겪었다.
 *   ① v1.4.29 — 정렬 없는 limit으로 due 카드가 창 밖으로 밀려 "뱃지 40 / 광산 0"
 *   ② v1.4.38 — Supabase Data API의 `Max rows`가 1,000이라 `limit=12000`을 보내도 1,000행만 왔다.
 *      관제실 누적 분석이 몇 달째 **최근 1,000문항만** 보고 있었다(L49).
 *   ③ v1.4.40 — 같은 절단이 "문제 다시보기"·가족 대시보드·네비 뱃지·보상 페이스에 **그대로 남아 있었다.**
 *      라이브에서 날짜 드롭다운에 7/15·16·17 세 날짜만 떴다.
 *   → 조회는 사람이 기억할 수 있는 규칙이 아니다. 스크립트가 전수로 본다.
 *
 * ★2026-08-16 신규 작성★ `verify.sh`가 부르는데 저장소·노트북 어디에도 없었다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }

/** 주석은 코드가 아니다 — 걷어내고 본다(주석 속 문자열에 속지 않기 위해). */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const walk = d => readdirSync(d).flatMap(n => {
  const p = join(d, n)
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(p) ? [p] : [])
})
const FILES = walk('src')

/** 행 수가 커질 수 있어 **반드시 페이지네이션**이 필요한 테이블 */
const BIG = ['answer_events', 'xp_events', 'review_cards', 'sessions', 'module_progress']

console.log(`── ① 대상 파일 ${FILES.length}개 스캔 ──`)

console.log('── ② ★큰 테이블은 selectAll로만 조회한다 (L49)★ ──')
{
  const bad = []
  for (const f of FILES) {
    strip(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
      const m = /db\.select\(\s*'([a-z_]+)'/.exec(line)
      if (m && BIG.includes(m[1])) bad.push(`${f}:${i + 1} ${m[1]}`)
    })
  }
  ok(bad.length === 0, `큰 테이블(${BIG.join('·')})에 db.select가 남아 있지 않다`, `→ ${bad.join(' | ')}`)
}

console.log('── ③ ★페이지네이션에는 정렬이 필수다 (L31)★ ──')
{
  // selectAll(table, query) 호출의 query에 order가 있어야 한다. 조회식 상수(dueCardsQuery 등)는 별도 확인.
  /** ★조회식은 여러 줄로 이어 붙여 쓴다★ — 첫 줄만 보면 놓친다.
   *  (2026-08-16: 이 검사의 첫 판이 정상 코드를 3건 오탐했다. 괄호를 세어 호출 전체를 읽는다.) */
  const callArgs = (t, i) => {          // i = '(' 위치
    let d = 0
    for (let k = i; k < t.length && k < i + 4000; k++) {
      if (t[k] === '(') d++
      else if (t[k] === ')') { d--; if (d === 0) return t.slice(i + 1, k) }
    }
    return t.slice(i + 1, i + 400)
  }
  const bad = []
  for (const f of FILES) {
    const t = strip(readFileSync(f, 'utf8'))
    const re = /selectAll\(/g
    let m
    while ((m = re.exec(t))) {
      const args = callArgs(t, m.index + 'selectAll'.length)
      const table = (/^\s*'([a-z_]+)'/.exec(args) || [])[1]
      // 첫 인자가 문자열 리터럴이 아니면 호출부가 아니다 — selectAll 정의 자체나 얇은 래퍼(get(table, query))다.
      if (!table) continue
      if (!/order=/.test(args) && !/Query\(/.test(args)) bad.push(`${f} ${table}: ${args.replace(/\s+/g, ' ').slice(0, 80)}`)
    }
  }
  ok(bad.length === 0, '모든 selectAll 조회식에 order가 있다', `→ ${bad.join(' | ')}`)
  // 조회식을 만들어 주는 헬퍼도 검사한다
  const rv = strip(readFileSync('src/lib/review.ts', 'utf8'))
  ok(/order=box\.asc/.test(rv) && /order=id\.asc/.test(rv), '복습 조회 헬퍼 2종에 정렬이 있다')
}

console.log('── ④ 하드코딩된 limit이 상한처럼 쓰이지 않는가 ──')
{
  // `limit=` 자체는 selectAll이 stripPaging으로 떼어내므로 무해하지만,
  // db.select와 **같은 호출**에 4자리 이상 limit이 붙어 있으면 그건 "서버가 다 줄 것"이라는 착각이다.
  const bad = []
  for (const f of FILES) {
    strip(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
      if (/db\.select\(/.test(line) && /limit=\$?\{?\d{4,}/.test(line)) bad.push(`${f}:${i + 1}`)
    })
  }
  ok(bad.length === 0, 'db.select에 4자리 이상 limit이 붙은 곳이 없다', `→ ${bad.join(' | ')}`)
}

console.log('── ⑤ selectAll 자체의 계약 (supabase.ts) ──')
{
  const s = strip(readFileSync('src/lib/supabase.ts', 'utf8'))
  ok(/PAGE_ROWS\s*=\s*1000/.test(s), '★서버 상한(1,000)을 페이지 크기로 알고 있다')
  ok(/offset=/.test(s), 'offset 페이지네이션을 쓴다')
  ok(/truncated/.test(s), '못 받은 것이 있으면 truncated로 알린다')
  ok(/stripPaging/.test(s), '호출자가 붙인 limit/offset을 떼어낸다 (이중 페이징 방지)')
  ok(!/rows\.length === .*limit/.test(s),
    '★"받은 행 수 == 내 limit"으로 포화를 판정하지 않는다 (서버 상한이 더 작으면 영원히 통과한다 — L49)')
}

console.log('── ⑥ 쓰기 조회는 학습 기록을 지우지 않는다 (CONTRACT) ──')
{
  const bad = []
  for (const f of FILES) {
    strip(readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
      const m = /db\.del\(\s*'([a-z_]+)'/.exec(line)
      if (m && ['answer_events', 'xp_events', 'sessions', 'module_progress', 'badges'].includes(m[1])) bad.push(`${f}:${i + 1} ${m[1]}`)
    })
  }
  ok(bad.length === 0, '★학습 기록 테이블에 DELETE가 없다 (answer_events 절대 삭제 금지)', `→ ${bad.join(' | ')}`)
}

console.log(fail === 0 ? '\n✅ query_check 통과' : `\n❌ query_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
