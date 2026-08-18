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
let bad=[], n=0, modeC={}, dup=0
for (const t of data.tiers) {
  for (let k=1;k<=4;k++){
    const packs = V.golemPackIds(t,k).map(id=>data.packs[id]).filter(Boolean)
    if (packs.length!==5) bad.push(`T${t.tier}#${k}: 팩 ${packs.length}개`)
    // 해금 상황: 이 골렘이 뜨는 시점의 누적 정복 팩 수
    const cleared = (t.tier-1)*20 + k*5
    const qs = V.buildGolemSession(packs, cleared, t.tier*100+k)
    n++
    if (qs.length!==12) bad.push(`T${t.tier}#${k}: 문항 ${qs.length}개`)
    const ws = qs.map(q=>q.word.w)
    if (new Set(ws).size!==ws.length) { dup++; bad.push(`T${t.tier}#${k}: 단어 중복`) }
    const srcPacks = new Set(packs.map(p=>p.pack_id))
    for (const q of qs){
      modeC[q.mode]=(modeC[q.mode]||0)+1
      if (q.mode==='speak') bad.push(`T${t.tier}#${k}: speak가 보스전에 들어옴`)
      if (!packs.some(p=>p.words.some(w=>w.w===q.word.w))) bad.push(`T${t.tier}#${k}: ${q.word.w} 출처 불명`)
      if (q.mode!=='spell'){ if(q.options.length!==4) bad.push(`T${t.tier}#${k}/${q.word.w}: 보기 ${q.options.length}`)
        if(!q.options.includes(q.answer)) bad.push(`T${t.tier}#${k}/${q.word.w}: 정답 없음`) }
      if (!q.id.startsWith('golem:')) bad.push(`id 형식: ${q.id}`)
    }
    // 다섯 팩 커버리지
    const cov = new Set(qs.map(q=>packs.find(p=>p.words.some(w=>w.w===q.word.w)).pack_id))
    if (cov.size<5) bad.push(`T${t.tier}#${k}: 5팩 중 ${cov.size}팩만 등장`)
  }
}
console.log('골렘 세션:',n,'개 · 모드 분포:',modeC)
console.log('결함:',bad.length); bad.slice(0,12).forEach(x=>console.log('  -',x))

// 속사 라운드
let rbad=[]
for (const pid in data.packs){
  const items=V.buildRapidRound(data.packs[pid], pid.length*7+13)
  if (items.length!==24) rbad.push(`${pid}: ${items.length}장`)
  const m=items.filter(i=>i.isMatch).length
  if (m<6||m>18) rbad.push(`${pid}: 진짜 짝 ${m}/24 (치우침)`)
  for(const i of items){ const w=data.packs[pid].words.find(x=>x.w===i.w)
    if(!w) rbad.push(`${pid}: 없는 단어 ${i.w}`)
    else if(i.isMatch && w.ko!==i.ko) rbad.push(`${pid}/${i.w}: 짝이라는데 뜻이 다름`)
    else if(!i.isMatch && w.ko===i.ko) rbad.push(`${pid}/${i.w}: ★가짜라는데 뜻이 맞음(오답 처리됨)★`) }
}
console.log('\n속사 라운드 200팩 · 결함:',rbad.length); rbad.slice(0,10).forEach(x=>console.log('  -',x))

// 골렘 소환 시점 (팩 진행에 따라 pendingGolem)
const prog={}; let events=[]
for (const t of data.tiers) for (const pid of t.packs){
  prog[pid]={status:'completed'}
  const p=V.pendingGolem(prog,t); if(p) { events.push(`${pid} 정복 → T${t.tier} 골렘 #${p}`); prog[V.golemId(t.tier,p)]={status:'completed'} }
}
console.log('\n골렘 등장 횟수:',events.length,'(기대 40)'); console.log(' 처음 3회:',events.slice(0,3).join(' / '))

/* ★v1.4.46 복원 시 추가★ 위와 같은 이유로 관문화한다(옛 판은 결함이 있어도 exit 0이었다).
   `bad`(골렘 세션 결함) · `rbad`(속사 라운드 결함) · 골렘 등장 40회 — 셋 다 봐야 한다. */
{
  const hard = (bad.length ? 1 : 0) + (rbad.length ? 1 : 0) + (events.length !== 40 ? 1 : 0)
  if (bad.length) console.log(`\n❌ 골렘 세션 결함 ${bad.length}건`)
  if (rbad.length) console.log(`❌ 속사 라운드 결함 ${rbad.length}건`)
  if (events.length !== 40) console.log(`❌ 골렘 등장 ${events.length}회 (기대 40)`)
  console.log(hard ? '\n❌ golem_check 실패' : '\n✅ golem_check 통과 (골렘 40세션 · 속사 200팩 · 결함 0)')
  process.exit(hard ? 1 : 0)
}
