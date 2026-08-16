/** xp_parity.mjs — XP 산식은 세 곳에서 쓰이고 정의는 한 곳이어야 한다 (L12·L27)
 *
 * ★왜 이 검사가 있(었)어야 하나★
 *   v1.4.17에서 봉합한 어휘 XP 산식이 v1.4.18 소스 복구 때 **통째로 유실돼** v1.4.19까지 배포됐다(L25).
 *   관제실이 51% 부풀어 있었는데 아무도 몰랐다. 산식이 사는 곳은 셋이다:
 *     ① 앱 부여(store.recordXp 경유) ② 관제실 파생(AdminPage.xpOf/moduleBonus) ③ 기기 병합(store.syncSharedDaily)
 *   셋이 전부 `lib/xp.ts` 하나만 부르는지 — 그리고 아무도 숫자를 복사해 두지 않았는지 — 를 본다.
 *
 * ★2026-08-16 재작성★ 이 파일은 `verify.sh`가 부르는데 **저장소·노트북 어디에도 없었다.**
 *   컨테이너에서만 만들어졌다가 사라져 온 것으로 보인다. 검사가 없으면 "통과"에 의미가 없다(L27).
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/xp_entry.ts', `import * as X from '../src/lib/xp'\nimport * as A from '../src/lib/adminMetrics'\n// @ts-ignore\nglobalThis.X = X; globalThis.A = A\n`)
execSync('/root/.bun/bin/bun build .verify/xp_entry.ts --outfile .verify/xp_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/xp_bundle.js')
const X = globalThis.X, A = globalThis.A

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const src = f => readFileSync(f, 'utf8')

console.log('── ① 문항 XP: CONTRACT §6 값 그대로인가 ──')
{
  ok(X.answerXpOf('quiz', true) === 10 && X.answerXpOf('quiz', false) === 0, '일반 문항 정답 10 / 오답 0')
  ok(X.answerXpOf('review', true) === 10 && X.answerXpOf('review', false) === 0, '복습 정답 10 (v1.2.0 — 기본코스와 동급, 50:50 원칙)')
  ok(X.answerXpOf('vocab', true) === 5 && X.answerXpOf('vocab', false) === 0, '어휘 문항 정답 5')
  ok(X.answerXpOf('diagnostic', true) === 0, '진단은 XP를 주지 않는다 (실력 신호가 아니다)')
  ok(X.answerXpOf('game_match', false) === 15, '짝맞추기는 정오답과 무관하게 15 (완주형)')
  ok(X.answerXpOf('speak', false) === 10, '말하기는 자기 채점이라 정오답 무관 10')
  ok(X.answerXpOf('forge_discover', true) === 2, '문장 발견 2')
}

console.log('── ② 모듈 보너스: id 규칙별 단일 분기 ──')
{
  ok(X.moduleBonusOf('A1', 100) === 50, '일반 모듈 50')
  ok(X.moduleBonusOf('DIAG-D1', 100) === 30, '진단 30')
  ok(X.moduleBonusOf('V1-01', 89) === 30, '어휘 팩 30 (90 미만)')
  ok(X.moduleBonusOf('V1-01', 90) === 45, '어휘 팩 ★★★ 30+15')
  ok(X.moduleBonusOf('GOLEM-T1-1', 100) === 40, '단어 골렘 40')
  ok(X.isVocabPackId('V12-07') && !X.isVocabPackId('V1-7') && !X.isVocabPackId('GOLEM-T1-1'), '어휘 팩 id 정규식 경계')
  ok(X.isVocabGolemId('GOLEM-T10-4') && !X.isVocabGolemId('GOLEM-T1'), '골렘 id 정규식 경계')
}

console.log('── ③ 레벨 곡선 ──')
{
  ok(X.levelForXp(0) === 1 && X.levelForXp(299) === 1 && X.levelForXp(300) === 2, '레벨 2 진입 = 누적 300')
  // 레벨 n 진입 누적 = 150·n·(n−1)
  let bad = null
  for (let n = 2; n <= 20; n++) {
    const need = 150 * n * (n - 1)
    if (X.levelForXp(need) !== n || X.levelForXp(need - 1) !== n - 1) { bad = n; break }
  }
  ok(bad === null, '레벨 2~20 진입 경계가 150·n·(n−1)과 정확히 일치', bad ? `→ 레벨 ${bad}에서 어긋남` : '')
  const lp = X.levelProgress(44569)
  ok(lp.level === 17 && lp.cur === 3769 && lp.need === 5100, '예한이 실측(44,569)이 LV.17 · 3769/5100', `→ ${JSON.stringify(lp)}`)
}

console.log('── ④ ★파생 XP는 관제실도 같은 함수를 쓴다★ ──')
{
  // adminMetrics.deriveXp가 자체 산식을 갖고 있으면 여기서 갈라진다.
  const ev = [
    { activity_type: 'quiz', is_correct: true, created_at: '2026-08-16T01:00:00Z', module_id: 'A1', response_ms: 3000 },
    { activity_type: 'review', is_correct: true, created_at: '2026-08-16T01:01:00Z', module_id: 'A1', response_ms: 3000 },
    { activity_type: 'vocab', is_correct: true, created_at: '2026-08-16T01:02:00Z', module_id: 'V1-01', response_ms: 3000 },
    { activity_type: 'game_match', is_correct: false, created_at: '2026-08-16T01:03:00Z', module_id: 'A1', response_ms: 3000 },
  ]
  const prog = [{ module_id: 'A1', status: 'completed', best_score: 100, completed_at: '2026-08-16T01:00:00Z', updated_at: '2026-08-16T01:00:00Z' }]
  const byHand = ev.reduce((a, e) => a + X.answerXpOf(e.activity_type, e.is_correct), 0) + X.moduleBonusOf('A1', 100)
  ok(A.deriveXp(ev, prog) === byHand, '관제실 파생 = xp.ts로 손계산한 값', `→ ${A.deriveXp(ev, prog)} vs ${byHand}`)
  // 복습 콤보: 하루 10장마다 +20
  const combo = Array.from({ length: 25 }, (_, i) => ({
    activity_type: 'review', is_correct: true, module_id: 'A1', response_ms: 300,
    created_at: new Date(Date.parse('2026-08-16T01:00:00+09:00') + i * 1000).toISOString(),
  }))
  ok(A.deriveXp(combo, []) === 25 * X.XP.reviewCorrect + 2 * X.XP.reviewCombo, '복습 25장 = 250 + 콤보 2회(40)', `→ ${A.deriveXp(combo, [])}`)
  // 유령 보스 보너스는 mastered_at에 귀속
  ok(A.deriveXp([], [{ module_id: 'A1', status: 'mastered', best_score: 100, completed_at: null, updated_at: '2026-08-16', mastered_at: '2026-08-16' }])
     === X.moduleBonusOf('A1', 100) + X.XP.ghostClear, '유령 보스 최초 통과 보너스 반영')
}

console.log('── ⑤ ★산식이 복사돼 있지 않은가 (L12 — 정의는 한 곳)★ ──')
{
  const admin = src('src/screens/AdminPage.tsx')
  const store = src('src/lib/store.ts')
  const metrics = src('src/lib/adminMetrics.ts')
  ok(/answerXpOf\(/.test(admin) && /moduleBonusOf\(/.test(admin), '관제실이 xp.ts 함수를 부른다')
  ok(/answerXpOf/.test(store) && /moduleBonusOf/.test(store), '기기 병합(store)이 xp.ts 함수를 부른다')
  ok(/answerXpOf|moduleBonusOf/.test(metrics), '파생 엔진이 xp.ts 함수를 부른다')
  // 숫자를 다시 적어 둔 흔적 — v1.4.17→18 유실 사고의 형태
  const copied = f => /case 'review':\s*return/.test(f) || /startsWith\('DIAG-'\)\s*\)\s*return 30/.test(f)
  ok(!copied(admin), '★관제실에 XP 분기가 복사돼 있지 않다 (v1.4.17→18 유실 회귀 감시)')
  ok(!copied(store), '★store에 XP 분기가 복사돼 있지 않다')
  ok(!/const XP = \{/.test(admin) && !/const XP = \{/.test(store), 'XP 상수표가 화면·store에 다시 선언돼 있지 않다')
}

console.log(fail === 0 ? '\n✅ xp_parity 통과' : `\n❌ xp_parity 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
