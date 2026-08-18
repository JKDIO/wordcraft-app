import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
// ★v1.4.46 복원★ 옛 판은 컨테이너 안에서만 만들어졌다 사라지는 `_measure_entry_out.js`에 의존했다.
//   그래서 verify.sh가 이 검사를 부르는데도 **저장소 어디에도 없어** 다섯 릴리스 동안 "미검증"이었다(L27).
//   이제 필요한 번들을 스스로 만든다 — 어디서 받아도 `node measure20.mjs` 한 줄로 돌아간다.
mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/v_entry.ts', `import * as V from '../src/lib/vocab'\n// @ts-ignore\nglobalThis.V = V\n`)
execSync('/root/.bun/bin/bun build .verify/v_entry.ts --outfile .verify/v_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/v_bundle.js')
const V = globalThis.V
import fs from 'fs'
const data = JSON.parse(fs.readFileSync('public/vocab.json','utf8'))

// 입력 방식 분류 (L26) — 모드 이름이 아니라 '손이 하는 행동'으로
const ACT = { meaning:'고르기', listen:'고르기', recall:'고르기', gap:'고르기', spell:'조립', speak:'말하기', sort:'분류' }

// 예한이의 실제 진행을 시뮬레이션: 팩을 순서대로 정복하며 cleared 가 늘어난다
let cleared = 0
const tally = {}, tierTally = {}, posDist=[0,0,0,0]
let qTotal=0, sortPacks=0, sortItems=0, defects=[]
const capUsed = {}
for (const t of data.tiers) {
  tierTally[t.tier] = {}
  for (const pid of t.packs) {
    const p = data.packs[pid]
    const sort = V.hasFeature(cleared,'sort') ? V.buildSortTask(p) : null
    const cap = sort ? V.MAX_QUESTIONS_WITH_SORT : V.MAX_QUESTIONS
    capUsed[cap]=(capUsed[cap]||0)+1
    const qs = V.buildSession(p, [], cleared, cap)
    qTotal += qs.length
    for (const q of qs) {
      const a = ACT[q.mode]; if(!a) defects.push(`${pid}: 알 수 없는 모드 ${q.mode}`)
      tally[a]=(tally[a]||0)+1; tierTally[t.tier][a]=(tierTally[t.tier][a]||0)+1
      // 무결성
      if (q.mode!=='speak' && q.mode!=='spell') {
        if (q.options.length!==4) defects.push(`${pid}/${q.word.w}/${q.mode}: 보기 ${q.options.length}개`)
        if (!q.options.includes(q.answer)) defects.push(`${pid}/${q.word.w}/${q.mode}: 정답이 보기에 없음`)
        if (new Set(q.options).size!==q.options.length) defects.push(`${pid}/${q.word.w}/${q.mode}: 보기 중복`)
        const i = q.options.indexOf(q.answer); if(i>=0) posDist[i]++
      }
      if (q.mode==='spell' && !q.options.join('').includes(q.answer[0])) defects.push(`${pid}/${q.word.w}: 철자 타일에 정답 글자 없음`)
      if (!q.prompt || /undefined|NaN/.test(q.prompt+q.promptKo)) defects.push(`${pid}/${q.word.w}/${q.mode}: 프롬프트 이상`)
    }
    if (sort) {
      sortPacks++; sortItems += sort.items.length
      tally['분류']=(tally['분류']||0)+sort.items.length
      tierTally[t.tier]['분류']=(tierTally[t.tier]['분류']||0)+sort.items.length
      if (sort.boxes.length<2||sort.boxes.length>3) defects.push(`${pid}: 분류 상자 ${sort.boxes.length}개`)
      for (const it of sort.items) if(!sort.boxes.includes(it.box)) defects.push(`${pid}: ${it.w} 정답 상자가 목록에 없음`)
    }
    cleared++
  }
}
const grand = Object.values(tally).reduce((a,b)=>a+b,0)
console.log('=== 입력 방식 비율 (200팩 전수, 해금 곡선 시뮬레이션) ===')
for (const k of ['고르기','조립','말하기','분류']) console.log(` ${k}: ${tally[k]||0} (${((tally[k]||0)/grand*100).toFixed(1)}%)`)
console.log(` 총 행동 ${grand} · 문항 ${qTotal} · 분류칩 ${sortItems}`)
console.log('\n=== 티어별 고르기(탭) 비율 — 초반 구간이 나빠지지 않았는지 (L26 규칙4) ===')
for (const t of data.tiers){const s=Object.values(tierTally[t.tier]).reduce((a,b)=>a+b,0)
  console.log(` T${t.tier}: 탭 ${((tierTally[t.tier]['고르기']||0)/s*100).toFixed(1)}% · 조립 ${tierTally[t.tier]['조립']||0} · 말하기 ${tierTally[t.tier]['말하기']||0} · 분류 ${tierTally[t.tier]['분류']||0}`)}
console.log('\n=== 첫 10팩 (예한이가 실제로 처음 겪는 구간) ===')
cleared=0
for (const pid of data.tiers[0].packs.slice(0,10)) {
  const p=data.packs[pid]; const sort=V.hasFeature(cleared,'sort')?V.buildSortTask(p):null
  const qs=V.buildSession(p,[],cleared,sort?V.MAX_QUESTIONS_WITH_SORT:V.MAX_QUESTIONS)
  const c={}; qs.forEach(q=>c[ACT[q.mode]]=(c[ACT[q.mode]]||0)+1)
  const nu=V.newUnlockAt(cleared)
  console.log(` ${pid} (정복 ${cleared}) 문항 ${qs.length} ${JSON.stringify(c)}${sort?` +분류 ${sort.items.length}`:''}${nu?`  🔓 ${nu.name}`:''}`)
  cleared++
}
const pd=posDist.reduce((a,b)=>a+b,0)
console.log('\n=== 4지선다 정답 위치 분포 (L24 판정: 25%±2%p) ===')
console.log(' ', posDist.map(x=>(x/pd*100).toFixed(2)+'%').join(' / '), `(n=${pd})`)
console.log('\n분류 상자가 붙는 팩:', sortPacks, '/200 · 문항수 상한 사용:', JSON.stringify(capUsed))
console.log('무결성 결함:', defects.length); defects.slice(0,15).forEach(d=>console.log('  -',d))

/* ★v1.4.46 복원 시 추가★ 이 스크립트는 예전에 **보고서**였다 — 결함이 있어도 0으로 끝났다.
   `verify.sh`가 `set -e`로 부르는데 실패를 안 알리면 검사가 아니라 장식이다. 관문으로 바꾼다. */
{
  const worst = Math.max(...posDist.map(x => Math.abs(x/pd*100 - 25)))
  let bad = 0
  if (defects.length) { console.log(`\n❌ 무결성 결함 ${defects.length}건`); bad++ }
  if (worst > 2.0) { console.log(`\n❌ 4지선다 정답 위치가 25%에서 ${worst.toFixed(2)}%p 벗어남 (허용 2.0%p — L24)`); bad++ }
  console.log(bad ? '\n❌ measure20 실패' : '\n✅ measure20 통과 (정답 위치 최대 편차 ' + worst.toFixed(2) + '%p)')
  process.exit(bad ? 1 : 0)
}
