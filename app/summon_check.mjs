// 🔮 문장 소환 스텝 전수 기계 검증 (v1.4.24)
//
// 왜 스크립트인가: v1.4.2에서 고친 "문장과 애니메이션 불일치"가 소스 재구성 때 조용히 되돌아갔다(L27).
// 같은 일이 콘텐츠에서 반복되지 않도록, scene↔문장 일치를 **사람 기억이 아니라 검사**로 못박는다.
import fs from 'fs'

const content = JSON.parse(fs.readFileSync('public/content.json', 'utf8'))
const errs = [], warns = []
const E = m => errs.push(m)
const W = m => warns.push(m)

/* 무대가 실제로 재현할 수 있는 것 — src/lib/forge.ts 와 1:1 (여기가 어긋나면 아이 화면이 거짓말을 한다) */
const ACTORS = {
  zombie: 'The zombie', bomb: 'The monster', cake: 'The cake', dog: 'The dog', cat: 'The cat',
}
const OBJECTS = {
  cake: 'the cake', bomb: 'the monster', dog: 'the dog', cat: 'the cat', zombie: 'the zombie',
}
const VERBS = {
  jump: 'jumps', run: 'runs', eat: 'eats', sleep: 'sleeps', dance: 'dances', fly: 'flies',
  cry: 'cries', laugh: 'laughs', spin: 'spins', fall: 'falls', explode: 'explodes', hug: 'hugs',
}
const NEEDS_OBJECT = new Set(['hug'])
const ALLOWS_OBJECT = new Set(['hug', 'eat'])
const SPEEDS = { 1.7: 'fast', 0.55: 'slowly' }

/** answer를 tokens로 분해하는 경로가 정확히 1개인지 — 2개 이상이면 아이가 맞혀도 틀릴 수 있다 */
function decompositions(answer, tokens) {
  const used = new Array(tokens.length).fill(false)
  let count = 0
  ;(function go(rest) {
    if (count > 1) return
    if (!rest.length) { count++; return }
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue
      const t = tokens[i]
      if (rest === t || rest.startsWith(t + ' ')) {
        used[i] = true
        go(rest === t ? '' : rest.slice(t.length + 1))
        used[i] = false
      }
    }
  })(answer)
  return count
}

const BAN = [/똑똑/, /천재/, /바보/, /멍청/, /이것도\s*몰/, /감점/, /창피/, /실망/, /친구들은/, /머리가\s*좋/]

let nItems = 0, nScene = 0, nEngrave = 0, nModules = 0
const ids = new Set()

for (const [mid, mod] of Object.entries(content.modules)) {
  const steps = mod.steps || []
  const sIdx = steps.findIndex(s => s.type === 'summon')
  if (sIdx < 0) continue
  nModules++
  const step = steps[sIdx]

  // 자리: 마지막 quiz 바로 앞
  const qIdx = steps.findIndex(s => s.type === 'quiz')
  if (qIdx < 0) E(`${mid}: quiz 스텝이 없다`)
  else if (sIdx !== qIdx - 1) E(`${mid}: summon 스텝은 quiz 바로 앞이어야 한다 (summon@${sIdx}, quiz@${qIdx})`)
  if (steps.filter(s => s.type === 'summon').length > 1) E(`${mid}: summon 스텝이 2개 이상`)
  if (!step.prompt_ko) W(`${mid}: prompt_ko 없음`)

  const items = step.items || []
  if (items.length !== 3) E(`${mid}: summon items ${items.length}개 (기대 3)`)

  items.forEach((it, k) => {
    nItems++
    const tag = `${mid}-SM-${k + 1}`
    // 기본 스키마
    if (it.id !== tag) E(`${tag}: id 불일치 (${it.id})`)
    if (ids.has(it.id)) E(`${it.id}: id 중복`)
    ids.add(it.id)
    for (const key of ['ko', 'answer', 'focus_ko', 'explain_ko']) {
      if (!it[key] || typeof it[key] !== 'string') E(`${tag}: ${key} 없음`)
    }
    if (!Array.isArray(it.tokens)) { E(`${tag}: tokens 배열 아님`); return }
    if (it.tokens.length < 4 || it.tokens.length > 7) E(`${tag}: tokens ${it.tokens.length}개 (기대 4~7)`)
    if (new Set(it.tokens).size !== it.tokens.length) E(`${tag}: tokens 중복`)
    if (/[.]$/.test(it.answer)) E(`${tag}: answer 끝에 마침표`)

    // ★핵심★ answer가 tokens로 유일하게 분해되는가
    const d = decompositions(it.answer.trim(), it.tokens)
    if (d === 0) E(`${tag}: tokens로 answer를 만들 수 없다 — "${it.answer}"`)
    else if (d > 1) E(`${tag}: answer 분해 경로가 2개 이상 (아이가 맞혀도 틀릴 수 있다)`)

    // 오답 블록이 최소 1개는 있어야 (그냥 순서 맞추기가 되지 않도록)
    const usedLen = it.answer.trim().split(/\s+/).length
    const tokLen = it.tokens.join(' ').split(/\s+/).length
    if (tokLen <= usedLen) W(`${tag}: 오답 블록이 없다 (전 블록이 정답에 쓰임)`)

    // tts ↔ voice 짝
    if ((it.tts && !it.voice) || (!it.tts && it.voice)) E(`${tag}: tts/voice 한쪽만 있음`)
    if (it.tts) {
      if (/[\[\]*_<>]/.test(it.tts)) E(`${tag}: tts에 화면 기호`)
      if (/[가-힣]/.test(it.tts)) E(`${tag}: tts에 한글`)
      if (it.tts.trim().replace(/[.]$/, '') !== it.answer.trim()) W(`${tag}: tts와 answer가 다르다`)
    } else W(`${tag}: tts 없음 (소리로 확인할 수 없다)`)

    // 금지 문구
    for (const f of ['ko', 'focus_ko', 'explain_ko']) {
      for (const re of BAN) if (re.test(it[f] || '')) E(`${tag}: 금지 문구(${f}) /${re.source}/`)
    }

    // ★★scene ↔ 문장 일치 — 이 검사가 이 파일의 존재 이유★★
    if (!it.scene) { nEngrave++; return }
    nScene++
    const sc = it.scene
    const subj = ACTORS[sc.actor]
    const verb = VERBS[sc.verb]
    if (!subj) { E(`${tag}: scene.actor 알 수 없음 (${sc.actor})`); return }
    if (!verb) { E(`${tag}: scene.verb 알 수 없음 (${sc.verb})`); return }
    if (sc.object !== undefined) {
      if (!OBJECTS[sc.object]) { E(`${tag}: scene.object 알 수 없음 (${sc.object})`); return }
      if (!ALLOWS_OBJECT.has(sc.verb)) E(`${tag}: ${sc.verb}는 목적어를 가질 수 없다`)
    }
    if (NEEDS_OBJECT.has(sc.verb) && sc.object === undefined) E(`${tag}: ${sc.verb}는 목적어가 필수`)

    const a = ' ' + it.answer.toLowerCase() + ' '
    // 주어: 문장에 그 배역의 주어 표기가 들어 있어야 한다(소유격 변형 허용 — my cat 등)
    const subjNoun = subj.toLowerCase().replace(/^the /, '')
    if (!a.includes(' ' + subj.toLowerCase() + ' ') && !new RegExp(`\\b(my|your|his|her|our|their)\\s+${subjNoun}\\b`).test(a))
      E(`${tag}: scene.actor=${sc.actor}인데 문장에 "${subj}"가 없다 — 화면과 문장이 어긋난다`)
    if (!a.includes(' ' + verb + ' ')) E(`${tag}: scene.verb=${sc.verb}인데 문장에 "${verb}"가 없다`)
    if (sc.object !== undefined) {
      const objNoun = OBJECTS[sc.object].replace(/^the /, '')
      if (!a.includes(' ' + OBJECTS[sc.object] + ' ') && !new RegExp(`\\b(my|your|his|her|our|their)\\s+${objNoun}\\b`).test(a))
        E(`${tag}: scene.object=${sc.object}인데 문장에 "${OBJECTS[sc.object]}"가 없다`)
    }
    if (sc.speed !== undefined) {
      const adv = SPEEDS[sc.speed]
      if (!adv) E(`${tag}: scene.speed=${sc.speed} (fast=1.7 · slowly=0.55만 가능)`)
      else if (!a.includes(' ' + adv + ' ')) E(`${tag}: scene.speed가 ${adv}인데 문장에 없다`)
    } else if (/\b(fast|slowly)\b/.test(a)) {
      W(`${tag}: 문장에 fast/slowly가 있는데 scene.speed가 없다 — 애니메이션 속도가 문장과 다르다`)
    }
    // 무대가 재현하지 못하는 요소가 문장에 섞이면 그것도 불일치다
    if (/\b(will|was|were|did|didn't|won't|going to|yesterday|tomorrow|is |are |am )\b/.test(a))
      E(`${tag}: 무대는 현재형만 재현한다 — 이 문장엔 scene을 붙이면 안 된다`)
  })
}

console.log(`=== 🔮 문장 소환 ===`)
console.log(`모듈 ${nModules}개 · 문항 ${nItems}개 (무대 재현 ${nScene} · 문장 각인 ${nEngrave})`)
console.log(`\n=== 오류 ${errs.length} ===`)
errs.forEach(e => console.log(' ❌ ' + e))
console.log(`=== 경고 ${warns.length} ===`)
warns.forEach(w => console.log(' ⚠️  ' + w))
if (errs.length) process.exit(1)
console.log('\n✅ 문장 소환 전수 검증 통과')
