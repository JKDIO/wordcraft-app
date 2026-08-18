/** shuffle_check.mjs — 객관식 선택지 셔플 (v1.4.46 신설 · C1 봉인)
 *
 * ★왜★ 2026-08-18까지 `QuestionCard`는 `item.choices`를 적힌 순서 그대로 그렸고,
 *   콘텐츠의 정답 위치는 균등하지 않았다. **월드 1은 44문항 중 27개(61.4%)가 A**다.
 *   영어를 몰라도 A만 찍으면 61%를 맞힌다 — 그러면 정답률은 실력이 아니라 위치 습관을 잰다.
 *
 * ★이 검사가 잠그는 것★
 *   ① 순열이 진짜 순열인가 (원소 유실·중복 없음)
 *   ② 자리 분포가 균등한가 (전수 표본 — L24 계측 원칙)
 *   ③ **실제 content.json을 그렸을 때** 정답 위치 편향이 사라지는가
 *   ④ ★소비자 검사(L51)★ — 라이브러리만 고치고 화면을 그대로 두면 아무 일도 안 일어난다.
 *      `QuestionCard`가 실제로 섞어 그리는지, 그리고 밖으로 내보내는 인덱스를 **원본으로 되돌리는지**.
 *      (되돌리지 않으면 `answer_events.given_answer`에 엉뚱한 보기 문자열이 박힌다 — 조용한 데이터 오염)
 *   ⑤ 한 문항을 푸는 동안 자리가 안 흔들리는가 / 다시 만나면 자리가 바뀌는가
 *
 * ★L59★ 식별자 하나만 grep하지 않는다. 정의가 아니라 **호출 문맥**을 본다.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/sh_entry.ts', `import * as SH from '../src/lib/shuffle'\n// @ts-ignore\nglobalThis.SH = SH\n`)
execSync('/root/.bun/bin/bun build .verify/sh_entry.ts --outfile .verify/sh_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/sh_bundle.js')
const SH = globalThis.SH

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const src = f => strip(readFileSync(f, 'utf8'))

console.log('── ① 순열의 무결성 ──')
{
  let bad = 0
  for (let n = 2; n <= 6; n++) {
    for (let s = 0; s < 4000; s++) {
      const p = SH.choicePermutation(n, s * 2654435761)
      if (p.length !== n) { bad++; continue }
      const seen = new Set(p)
      if (seen.size !== n) bad++
      for (const x of p) if (!(Number.isInteger(x) && x >= 0 && x < n)) bad++
    }
  }
  ok(bad === 0, '길이 2~6 · 20,000 표본 전부 원소 유실·중복 0', `(결함 ${bad})`)
  ok(SH.choicePermutation(1, 12345).join() === '0', '선택지 1개는 그대로')
  ok(SH.choicePermutation(0, 1).length === 0, '선택지 0개도 터지지 않는다')
}

console.log('── ② 자리 분포가 균등한가 (L24: 25%±2%p) ──')
{
  const N = 240000
  const grid = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] // grid[원본][화면]
  for (let s = 0; s < N; s++) {
    const p = SH.choicePermutation(4, SH.fmix32(s))
    for (let disp = 0; disp < 4; disp++) grid[p[disp]][disp]++
  }
  let worst = 0
  for (let o = 0; o < 4; o++) for (let d = 0; d < 4; d++) {
    worst = Math.max(worst, Math.abs(grid[o][d] / N * 100 - 25))
  }
  console.log('    원본→화면 분포(%):', grid.map(r => r.map(x => (x / N * 100).toFixed(2)).join('/')).join('  '))
  ok(worst < 1.0, `★모든 (원본,화면) 칸이 25%에서 ${worst.toFixed(2)}%p 이내`)

  // 하위 비트 상관 회귀 방어 — review.ts:gradeSwapped 가 두 번 틀렸던 자리와 같은 함정.
  let alt = 0
  let prev = SH.choicePermutation(4, SH.fmix32(0))[0]
  for (let s = 1; s < 20000; s++) {
    const cur = SH.choicePermutation(4, SH.fmix32(s))[0]
    if (cur !== prev) alt++
    prev = cur
  }
  const altPct = alt / 19999 * 100
  console.log(`    연속 씨앗에서 첫 자리가 바뀌는 비율: ${altPct.toFixed(1)}% (기대 75%)`)
  ok(altPct > 65 && altPct < 85, '★연속 씨앗이 규칙적으로 교대하지 않는다 (하위 비트 상관 없음)')
}

console.log('── ③ ★실제 콘텐츠를 그렸을 때 편향이 사라지는가★ ──')
{
  const D = JSON.parse(readFileSync('public/content.json', 'utf8'))
  const items = []
  const walk = (n) => {
    if (Array.isArray(n)) { for (const v of n) walk(v); return }
    if (n && typeof n === 'object') {
      if (Array.isArray(n.choices) && Number.isInteger(n.answer_idx)) items.push(n)
      for (const v of Object.values(n)) walk(v)
    }
  }
  walk(D)
  const four = items.filter(i => i.choices.length === 4)
  const chi = (c, k) => { const t = c.reduce((a, b) => a + b, 0); const e = t / k; return c.reduce((a, x) => a + (x - e) ** 2 / e, 0) }

  const raw = [0, 0, 0, 0]
  for (const it of four) raw[it.answer_idx]++
  const rawChi = chi(raw, 4)
  console.log(`    섞기 전: ${raw.join('/')} · χ²=${rawChi.toFixed(1)} (n=${four.length})`)
  ok(rawChi > 20, '전제 확인 — 원본 콘텐츠는 실제로 치우쳐 있다 (이 검사의 존재 이유)')

  /* 각 문항을 40번씩 만난다고 보고 화면상의 정답 자리를 센다.
     ★씨앗을 `nextPresentationSeed`가 아니라 **결정적으로** 만든다★
       처음에는 실제 함수를 그대로 썼는데, 그 안의 소금이 실행마다 랜덤이라
       **검사가 5번에 1번꼴로 실패했다**(χ²=7.81은 애초에 "우연히 5%는 넘는다"는 임계값이다).
       가끔 우는 검사는 아무도 안 믿는다 — 곧 무시된다. 그래서 분포 판정은 결정적 씨앗으로 하고,
       "실행마다 자리가 달라지는가"는 ⑤에서 따로 본다. */
  const shown = [0, 0, 0, 0]
  for (let rep = 0; rep < 40; rep++) {
    for (const it of four) {
      const p = SH.choicePermutation(4, SH.fmix32(SH.hashStr(it.id) ^ (rep * 0x9e3779b1)))
      shown[p.indexOf(it.answer_idx)]++
    }
  }
  const shownChi = chi(shown, 4)
  const tot = shown.reduce((a, b) => a + b, 0)
  const worstShown = Math.max(...shown.map(x => Math.abs(x / tot * 100 - 25)))
  console.log(`    섞은 뒤: ${shown.join('/')} → ${shown.map(x => (x / tot * 100).toFixed(1) + '%').join(' ')} · χ²=${shownChi.toFixed(1)} · 최대편차 ${worstShown.toFixed(2)}%p`)
  ok(worstShown < 1.0, `★화면상의 정답 위치가 균등하다 (최대편차 ${worstShown.toFixed(2)}%p < 1.0%p · χ²=${shownChi.toFixed(1)})`)

  // 가장 심했던 곳 — 월드 1 (44문항 중 27개가 A)
  const w1 = []
  for (const [, m] of Object.entries(D.modules)) {
    if (m.world !== 1) continue
    const local = []
    const w = (n) => {
      if (Array.isArray(n)) { for (const v of n) w(v); return }
      if (n && typeof n === 'object') {
        if (Array.isArray(n.choices) && Number.isInteger(n.answer_idx) && n.choices.length === 4) local.push(n)
        for (const v of Object.values(n)) w(v)
      }
    }
    w(m); w1.push(...local)
  }
  const w1raw = [0, 0, 0, 0]; for (const it of w1) w1raw[it.answer_idx]++
  const w1shown = [0, 0, 0, 0]
  for (let rep = 0; rep < 2000; rep++) for (const it of w1) {
    const p = SH.choicePermutation(4, SH.fmix32(SH.hashStr(it.id) ^ (rep * 0x9e3779b1)))
    w1shown[p.indexOf(it.answer_idx)]++
  }
  const w1tot = w1shown.reduce((a, b) => a + b, 0)
  const w1worst = Math.max(...w1shown.map(x => Math.abs(x / w1tot * 100 - 25)))
  console.log(`    월드1 섞기 전: ${w1raw.join('/')} (A ${(w1raw[0] / w1.length * 100).toFixed(1)}%)`)
  console.log(`    월드1 섞은 뒤: ${w1shown.map(x => (x / w1tot * 100).toFixed(1) + '%').join(' ')} · 최대편차 ${w1worst.toFixed(2)}%p`)
  ok(w1worst < 1.0, `★월드1(A 61.4% → 25%)도 섞은 뒤에는 균등하다 (최대편차 ${w1worst.toFixed(2)}%p)`)
}

console.log('── ④ ★소비자 검사 — 화면이 실제로 섞어 그리는가 (L51)★ ──')
{
  const q = src('src/engine/QuestionCard.tsx')
  ok(/const order = useMemo\(\s*\(\) => choicePermutation\(item\.choices\.length, nextPresentationSeed\(item\.id\)\)/.test(q),
    '★QuestionCard가 문항마다 순열을 뽑는다 (정의가 아니라 호출 — L59)')
  ok(/\[item\.id, item\.choices\.length\]/.test(q),
    '★순열 deps가 item.id — useState 초기화로 두면 첫 문항 순열이 끝까지 남는다')
  ok(/const shownAnswer = order\.indexOf\(item\.answer_idx\)/.test(q), '★화면상의 정답 자리를 순열로 구한다')
  ok(/\{order\.map\(\(src, i\) => \{/.test(q), '★보기를 order 순서로 그린다')
  ok(!/item\.choices\.map\(/.test(q), '★item.choices를 원래 순서로 그리는 코드가 남아 있지 않다')
  ok(/givenIdx: order\[i\]/.test(q), '★★밖으로 내보내는 인덱스를 원본으로 되돌린다 (안 하면 given_answer가 오염된다)')
  ok(/correct: i === shownAnswer/.test(q), '★정답 판정은 화면 자리로 한다')
  ok(/const correct = graded && picked === shownAnswer/.test(q), '★피드백 표시도 화면 자리 기준')
  ok(!/picked === item\.answer_idx/.test(q), '★원본 인덱스로 채점하는 코드가 남아 있지 않다')

  // 소비자 4곳이 givenIdx를 원본 인덱스로 쓰고 있다는 전제 — 이게 깨지면 위 매핑의 의미가 바뀐다.
  for (const f of ['src/engine/StepRunner.tsx', 'src/screens/DiagnosticRun.tsx', 'src/screens/ListenArcade.tsx', 'src/screens/GhostBattle.tsx']) {
    ok(/choices\[r\.givenIdx\]|choices\[r\.givenIdx\]|q\.choices\[r\.givenIdx\]/.test(src(f)),
      `${f}가 givenIdx로 원본 보기를 읽는다 (원본 인덱스 계약)`)
  }
}

console.log('── ⑤ 안정성 — 푸는 동안 고정 · 다시 만나면 변경 ──')
{
  const a = SH.choicePermutation(4, 777).join()
  const b = SH.choicePermutation(4, 777).join()
  ok(a === b, '★같은 씨앗이면 항상 같은 순열 (푸는 동안 자리가 흔들리지 않는다)')
  SH._resetPresentationCounts()
  const s1 = SH.nextPresentationSeed('X-1')
  const s2 = SH.nextPresentationSeed('X-1')
  ok(s1 !== s2, '★같은 문항을 다시 만나면 씨앗이 달라진다 (자리 외우기 차단)')
  let diff = 0
  SH._resetPresentationCounts()
  for (let k = 0; k < 200; k++) {
    const p1 = SH.choicePermutation(4, SH.nextPresentationSeed(`Q${k}`)).join()
    const p2 = SH.choicePermutation(4, SH.nextPresentationSeed(`Q${k}`)).join()
    if (p1 !== p2) diff++
  }
  ok(diff > 140, `★연속 두 번 만났을 때 순열이 바뀌는 비율 ${(diff / 2)}% (기대 ~96%)`)
}

console.log(fail === 0 ? '\n✅ shuffle_check 통과' : `\n❌ shuffle_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
