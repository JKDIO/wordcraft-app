// 🔮 소환 스모크 하니스 생성기 (v1.4.29 신설)
// summon_smoke.mjs는 `.verify/summon_items.json`과 8098 포트의 하니스 페이지를 전제하는데,
// 그 둘을 만드는 방법이 어디에도 적혀 있지 않아 새 세션마다 스모크를 못 돌렸다. 그래서 스크립트로 남긴다.
//
// 사용:
//   node summon_harness_make.mjs
//   bun build .verify/summon_entry.tsx --outdir .verify/out --production
//   python3 -m http.server 8098 --directory .verify/out &
//   python3 -m http.server 8099 --directory dist &
//   node summon_smoke.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'

const content = JSON.parse(readFileSync('public/content.json', 'utf8'))
const items = []
;(function walk(o) {
  if (Array.isArray(o)) { for (const v of o) walk(v); return }
  if (o && typeof o === 'object') {
    if (o.type === 'summon' && Array.isArray(o.items)) items.push(...o.items)
    for (const v of Object.values(o)) walk(v)
  }
})(content)

mkdirSync('.verify/out', { recursive: true })
writeFileSync('.verify/summon_items.json', JSON.stringify(items))
writeFileSync('.verify/summon_entry.tsx', `// 자동 생성 (summon_harness_make.mjs) — 손으로 고치지 말 것
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { SummonExercise } from '../src/engine/SummonExercise'
import ITEMS from './summon_items.json'

function Harness() {
  const [n, setN] = useState(0)
  // @ts-ignore
  globalThis.__go = (i: number) => setN(i)
  return (
    <SummonExercise key={n} items={[(ITEMS as unknown[])[n]] as never} prompt_ko="스모크"
      onAnswer={() => {}} onDiscover={() => {}} onFinish={() => {}} />
  )
}
createRoot(document.getElementById('root')!).render(<Harness />)
`)
writeFileSync('.verify/out/index.html',
  '<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"></head>'
  + '<body><div id="root"></div><script type="module" src="/summon_entry.js"></script></body></html>')
copyFileSync('public/app.css', '.verify/out/app.css')
console.log(`하니스 준비 완료 — 문항 ${items.length}개 (scene ${items.filter(i => i.scene).length}개)`)
