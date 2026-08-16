/** badge_check.mjs — 뱃지 판정: 단일 규칙 · 경계값 · 도달 가능성 (L27)
 *
 * ★왜★ 뱃지 규칙은 아이 화면(computeEarnedBadges)과 관제실(earnedFrom(facts))이 함께 쓴다.
 *   v1.4.20까지는 관제실에 규칙이 통째로 복사돼 있었고, 한쪽만 고치자 아이 도감과 아빠 화면이 갈라졌다
 *   (실측 25 vs 28 — L46). 그리고 2026-08-16 검증에서 `forge_5/20/50`이 **영영 안 뜨는** 상태였다.
 *   "받을 수 없는 뱃지"는 아이 입장에서 보상이 없는 방이다 — 도달 가능성을 검사로 봉인한다.
 *
 * ★2026-08-16 재작성★ `verify.sh`가 부르는데 저장소·노트북 어디에도 없었다.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/b_entry.ts', `import * as B from '../src/lib/badges'\nimport * as C from '../src/lib/content'\n// @ts-ignore\nglobalThis.B = B; globalThis.C = C\n`)
execSync('/root/.bun/bin/bun build .verify/b_entry.ts --outfile .verify/b_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/b_bundle.js')
const B = globalThis.B, C = globalThis.C

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const ALL = Object.keys(B.BADGE_DEFS)

const base = {
  modulesDone: [], perfectModule: false, perfectExt: false, diagDone: 0, streak: 0, bossWins: 0,
  reviewCorrect: 0, balanceDays: 0, forgeFound: 0, runeChapters: 0,
  vocabPacks: [], vocabPerfect: 0, golems: 0, legendWords: 0, sortPerfect: 0, rapidBest: 0,
}
const earned = f => new Set(B.earnedFrom({ ...base, ...f }))

console.log('── ① 정의 무결성 ──')
{
  ok(ALL.length > 0, `뱃지 정의 ${ALL.length}종`)
  const badGroup = ALL.filter(id => !B.BADGE_GROUPS.includes(B.BADGE_DEFS[id].group))
  ok(badGroup.length === 0, '모든 뱃지의 분야가 BADGE_GROUPS 안에 있다', `→ ${badGroup.join(', ')}`)
  const missing = ALL.filter(id => !B.BADGE_DEFS[id].name || !B.BADGE_DEFS[id].hint || !B.BADGE_DEFS[id].emoji)
  ok(missing.length === 0, '이름·이모지·획득 조건 문구가 전부 있다 (잠긴 뱃지도 목표가 되려면 필요)', `→ ${missing.join(', ')}`)
  const dupName = Object.values(B.BADGE_DEFS).map(d => d.name)
  ok(new Set(dupName).size === dupName.length, '뱃지 이름이 중복되지 않는다')
}

console.log('── ② ★도달 가능성 — 받을 수 없는 뱃지가 없는가★ ──')
{
  // 모든 조건을 최대로 채운 '만렙' 사실
  const allModules = [...C.MODULE_ORDER, ...C.EXT_MODULE_ORDER]
  const maxed = earned({
    modulesDone: allModules, perfectModule: true, perfectExt: true, diagDone: 4, streak: 365,
    bossWins: 999, reviewCorrect: 9999, balanceDays: 999, forgeFound: 999, runeChapters: 10,
    vocabPacks: Array.from({ length: 200 }, (_, i) => `V${Math.floor(i / 20) + 1}-${String((i % 20) + 1).padStart(2, '0')}`),
    vocabPerfect: 200, golems: 40, legendWords: 999,
  })
  const localOnly = ALL.filter(id => B.BADGE_DEFS[id].localOnly)
  const unreachable = ALL.filter(id => !maxed.has(id) && !localOnly.includes(id))
  ok(unreachable.length === 0, '서버 사실만으로 판정되는 뱃지는 전부 도달 가능하다', `→ 도달 불가: ${unreachable.join(', ')}`)
  ok(localOnly.length > 0, `앱 로컬 판정 뱃지 ${localOnly.length}종은 별도 표시(localOnly)`, `→ ${localOnly.join(', ')}`)
  const ghost = [...maxed].filter(id => !B.BADGE_DEFS[id])
  ok(ghost.length === 0, '★정의에 없는 id를 지급하지 않는다 (도감에 안 뜨는 유령 뱃지 금지)', `→ ${ghost.join(', ')}`)
}

console.log('── ③ 경계값 (하나 모자랄 때 안 주고, 딱 맞으면 준다) ──')
{
  const boundary = [
    ['forge_5', 'forgeFound', 5], ['forge_20', 'forgeFound', 20], ['forge_50', 'forgeFound', 50],
    ['boss_slayer', 'bossWins', 5], ['boss_15', 'bossWins', 15],
    ['diag_all', 'diagDone', 4],
    ['rune_first', 'runeChapters', 1], ['rune_5', 'runeChapters', 5], ['rune_10', 'runeChapters', 10],
    ['streak_30', 'streak', 30], ['balance_21', 'balanceDays', 21], ['review_500', 'reviewCorrect', 500],
  ]
  for (const [id, key, n] of boundary) {
    if (!B.BADGE_DEFS[id]) { ok(false, `${id} 정의가 있다`); continue }
    const below = earned({ [key]: n - 1 }).has(id)
    const at = earned({ [key]: n }).has(id)
    ok(!below && at, `${id}: ${key} ${n - 1} → 미지급 / ${n} → 지급`, `→ ${below}/${at}`)
  }
  ok(!earned({ modulesDone: [] }).has('first_module') && earned({ modulesDone: ['A1'] }).has('first_module'),
    'first_module: 0개 → 미지급 / 1개 → 지급')
}

console.log('── ④ 월드 정복 뱃지는 그 월드를 **전부** 클리어해야 한다 ──')
{
  for (const w of [...C.WORLDS, ...C.EXT_WORLDS]) {
    if (!w.modules.length) continue
    const id = `world${w.world}_clear`
    if (!B.BADGE_DEFS[id]) { ok(false, `${id} 정의가 있다`); continue }
    const partial = earned({ modulesDone: w.modules.slice(0, -1) }).has(id)
    const full = earned({ modulesDone: w.modules }).has(id)
    ok(!partial && full, `${id}: ${w.modules.length - 1}/${w.modules.length} → 미지급 / 전부 → 지급`)
  }
}

console.log('── ⑤ ★규칙이 두 곳에 복사돼 있지 않은가 (L27·L46)★ ──')
{
  /** ★정적 검사는 주석에 속는다★ — 2026-08-16에 실제로 당했다.
   *  `vocabPacks,` 한 줄을 주석 처리해 결함을 주입했는데, 문자열이 파일에 그대로 남아 검사가 통과했다.
   *  검사가 "코드"를 본다고 말하려면 먼저 주석을 걷어내야 한다(L27 ④ — 결함을 되살려 확인하라). */
  const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
  const src = f => strip(readFileSync(f, 'utf8'))
  const admin = src('src/screens/AdminPage.tsx')
  ok(/earnedFrom\(/.test(admin), '관제실이 badges.ts의 earnedFrom을 부른다')
  ok(!/add\(f\.modulesDone/.test(admin) && !/const add = \(cond/.test(admin),
    '★관제실에 뱃지 판정 규칙이 복사돼 있지 않다 (v1.4.20 갈라짐 회귀 감시)')
  ok(/computeEarnedBadges\(/.test(src('src/App.tsx')), '아이 앱이 badges.ts의 단일 진입점을 쓴다')
  // 관제실 facts가 앱 facts와 같은 필드를 채우는지 (빠뜨리면 그 뱃지가 조용히 영영 안 나온다)
  const keys = Object.keys(base)
  // 축약 속성(`vocabPacks,`)도 채운 것이다 — `키:` 만 찾으면 오탐한다.
  const filled = k => new RegExp(`(^|[\\s,{])${k}\\s*[,:}]`, 'm').test(admin)
  const missing = keys.filter(k => k !== 'sortPerfect' && k !== 'rapidBest' && !filled(k))
  ok(missing.length === 0, '관제실 facts가 BadgeFacts 필드를 전부 채운다', `→ 빠짐: ${missing.join(', ')}`)
}

console.log(fail === 0 ? '\n✅ badge_check 통과' : `\n❌ badge_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
