/** reward_check.mjs — 보상 로드맵: 규칙 단일화 · 경계값 (v1.4.22)
 *
 * ★왜★ 보상은 **아빠가 실제로 돈을 쓰는** 약속이다. 기준 XP·달성 판정·지급 여부가
 *   아이 화면(월드맵 스트립·보상 창고)과 관제실에서 갈라지면 "달성했다는데 왜 안 줘?"가 된다.
 *   그리고 도착 예상일은 **거짓 약속을 하면 안 된다** — 표본이 부족하면 말하지 않는다.
 *
 * ★2026-08-16 재작성★ `verify.sh`가 부르는데 저장소·노트북 어디에도 없었다.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/rw_entry.ts', `import * as R from '../src/lib/rewards'\n// @ts-ignore\nglobalThis.R = R\n`)
execSync('/root/.bun/bin/bun build .verify/rw_entry.ts --outfile .verify/rw_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/rw_bundle.js')
const R = globalThis.R

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const goal = (id, xp, extra = {}) => ({ id, threshold_xp: xp, title: `보상${id}`, emoji: '🎁', note: null, granted_at: null, ...extra })

console.log('── ① 입력 검증 (아빠가 잘못 넣는 것을 막는다) ──')
{
  const ex = [goal(1, 40000), goal(2, 55000)]
  ok(R.validateGoal(50000, '맛조개', ex) === null, '정상 입력은 통과')
  ok(R.validateGoal(0, 'x', ex) !== null, 'XP 0 이하 거부')
  ok(R.validateGoal(1.5, 'x', ex) !== null, '소수 거부')
  ok(R.validateGoal(10_000_001, 'x', ex) !== null, '과도한 값 거부')
  ok(R.validateGoal(1000, '   ', ex) !== null, '빈 이름 거부')
  ok(R.validateGoal(1000, 'ㄱ'.repeat(61), ex) !== null, '61자 이름 거부')
  ok(R.validateGoal(1000, 'ㄱ'.repeat(60), ex) === null, '60자는 허용 (경계)')
  ok(R.validateGoal(40000, '중복', ex) !== null, '★같은 XP 기준 중복 거부 (사다리가 뭉개진다)')
  ok(R.validateGoal(40000, '수정', ex, 1) === null, '자기 자신을 수정할 때는 중복이 아니다')
  const full = Array.from({ length: R.MAX_GOALS }, (_, i) => goal(i + 1, (i + 1) * 1000))
  ok(R.validateGoal(99999, 'x', full) !== null, `최대 ${R.MAX_GOALS}개 초과 거부`)
  ok(R.validateGoal(99999, 'x', full, 1) === null, '수정 중이면 개수 제한에 안 걸린다')
}

console.log('── ② 사다리 계산 (양쪽 화면의 단일 진실) ──')
{
  const goals = [goal(1, 10000), goal(2, 40000, { granted_at: '2026-08-01' }), goal(3, 55000)]
  const v = R.buildRewardView(goals, 44569)   // 예한이 실측
  ok(v.steps.length === 3, '단계 수')
  ok(v.steps[0].reached && v.steps[1].reached && !v.steps[2].reached, '44,569 기준 달성 2 / 미달성 1')
  ok(v.reachedCount === 2, '달성 수 2')
  ok(v.pending.length === 1 && v.pending[0].goal.id === 1, '★달성했는데 아직 안 준 것만 pending (지급 완료는 빠진다)')
  ok(v.next && v.next.goal.id === 3, '다음 목표는 55,000')
  ok(v.next.remaining === 55000 - 44569, `남은 XP ${55000 - 44569}`, `→ ${v.next?.remaining}`)
  const s3 = v.steps[2]
  ok(s3.from === 40000 && s3.span === 15000, '구간은 직전 목표부터 센다 (0부터가 아니라)')
  ok(s3.pct === Math.round(((44569 - 40000) / 15000) * 100), '진행률은 그 구간 기준', `→ ${s3.pct}%`)
  // 정렬이 뒤죽박죽이어도 사다리는 오름차순
  const shuffled = R.buildRewardView([goal(1, 55000), goal(2, 10000)], 0)
  ok(shuffled.steps[0].goal.threshold_xp === 10000, '입력 순서와 무관하게 오름차순')
  // 경계: 정확히 기준값이면 달성
  ok(R.buildRewardView([goal(1, 100)], 100).steps[0].reached, '기준값과 같으면 달성 (경계)')
  ok(!R.buildRewardView([goal(1, 100)], 99).steps[0].reached, '1 모자라면 미달성 (경계)')
  ok(R.buildRewardView([], 100).next === null, '목표가 없으면 next는 null (빈 상태)')
}

console.log('── ③ ★도착 예상일은 거짓 약속을 하지 않는다★ ──')
{
  ok(R.etaDays(0, 100, 10) === 0, '이미 달성이면 0일')
  ok(R.etaDays(1000, 100, 2) === null, '★표본 3일 미만이면 말하지 않는다')
  ok(R.etaDays(1000, 0, 10) === null, '★평균 XP가 0이면 말하지 않는다')
  ok(R.etaDays(1000, 100, 3) === 10, '표본 3일·하루 100 → 10일')
  ok(R.etaDays(10_000_000, 1, 10) === null, '★1,000일을 넘으면 말하지 않는다 (의미 없는 숫자)')
  // 안 한 날을 0으로 세면 평균이 꺼진다 → 학습한 날만 센다
  const rows = [
    { amount: 300, created_at: '2026-08-14T05:00:00Z' },
    { amount: 500, created_at: '2026-08-15T05:00:00Z' },
    { amount: 200, created_at: '2026-08-15T06:00:00Z' },
  ]
  const a = R.dailyXpAverage(rows, 14)
  ok(a.sampleDays === 2, '★학습한 날만 센다 (안 한 날을 0으로 세지 않는다)', `→ ${a.sampleDays}일`)
  ok(a.avg === 500, '하루 평균 = (300 + 700) / 2', `→ ${a.avg}`)
  ok(R.dailyXpAverage([], 14).sampleDays === 0, '기록이 없으면 표본 0')
}

console.log('── ④ 규칙이 화면에 복사돼 있지 않은가 (L27) ──')
{
  const src = f => strip(readFileSync(f, 'utf8'))
  const admin = src('src/screens/AdminPage.tsx'), board = src('src/screens/RewardBoard.tsx')
  ok(/buildRewardView\(/.test(admin), '관제실이 rewards.ts의 사다리 계산을 부른다')
  ok(/validateGoal\(/.test(admin), '관제실이 rewards.ts의 입력 검증을 부른다')
  ok(/buildRewardView\(/.test(board), '아이 보상 창고도 같은 계산을 부른다')
  ok(!/threshold_xp\s*-\s*totalXp/.test(admin) && !/threshold_xp\s*-\s*totalXp/.test(board),
    '★남은 XP를 화면에서 다시 계산하지 않는다')
  ok(R.REWARD_EMOJIS.length > 0 && new Set(R.REWARD_EMOJIS).size === R.REWARD_EMOJIS.length, '보상 이모지 목록에 중복이 없다')
}

console.log(fail === 0 ? '\n✅ reward_check 통과' : `\n❌ reward_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
