// 확장 월드(현 6~9 · 옛 7~10) 콘텐츠 전수 기계 검증 (v1.4.23 · ★v1.4.46 복원·개작★)
// L24·L26: 정답 위치 분포와 입력 방식 비율은 '전수 계측'으로만 판정한다.
//
// ★v1.4.46에서 무엇을 바꿨나★
//   옛 판은 저작 원본 폴더 `content_w710/`의 개별 JSON을 읽었다. 그 폴더는 저장소에 없다
//   (병합 파이프라인이 `content.json`으로 합친 뒤 사라졌다) — 그래서 `verify.sh`가 부르는데도
//   **다섯 릴리스 동안 한 번도 돌지 않았다.** 검사가 "존재하지만 실행 불가"인 것은 없는 것과 같다(L27).
//   → 이제 **실제로 배포되는 `public/content.json`** 을 읽는다. 검사 대상이 아이가 만나는 바로 그 데이터가 됐다.
//   → v1.4.42의 월드 재정렬(7~10 → 6~9)도 반영한다. 파일명이 아니라 모듈 id로 골라낸다.
import fs from 'fs'
const base = JSON.parse(fs.readFileSync('public/content.json', 'utf8'))
const files = Object.keys(base.modules).filter(k => /^[PWSG][1-6]$/.test(k)).sort().map(k => `${k}.json`)

const ids = new Set(), cards = new Set()
// content.json에 이미 병합된 뒤에도 이 검사를 돌릴 수 있어야 한다 → 신규 24모듈은 기준선에서 제외한다.
const EXT = /^([PWSG][1-6])$/
for (const [mid, m] of Object.entries(base.modules)) {
  if (EXT.test(mid)) continue
  for (const s of m.steps) {
    const arr = s.type === 'quiz' ? s.questions : (s.kind === 'match' ? [] : s.items)
    for (const it of arr || []) if (it && it.id) ids.add(it.id)
  }
  for (const q of m.boss.questions) ids.add(q.id)
  for (const c of m.review_cards) cards.add(c.card_id)
}
for (const [, g] of Object.entries(base.ghost || {})) for (const q of g.questions) ids.add(q.id)

const errs = [], warns = []
const E = m => errs.push(m), W = m => warns.push(m)
const SYM = /[[\]*_{}<>|]/
const STD = ['story','learn','game:choice','learn','game:order','story','learn','game:match','game:order','quiz','speak','speak']
// v1.4.24 개정 — 월드 9(S*)는 기획 §2 예외("speak 4개까지 허용, 대신 choice를 줄인다")를 적용한다.
// 옛 SPK는 step 9의 조립(order 6문항)을 speak로 **대체**해 조립이 12→6으로 줄고 탭 비율이 48%까지
// 올라가 있었다(L26 역주행). 조립 12는 유지하고 choice를 6→4로 줄여 speak 4를 확보한다 → 34유닛·탭 35%.
const SPK = ['story','learn','game:choice','learn','game:order','story','learn','game:match','game:order','quiz','speak','speak','speak','speak']

const units = {}, posAll = [0,0,0,0]
let playable = 0, ttsTexts = new Set()

for (const f of files) {
  const mid = f.replace('.json','')
  const m = base.modules[mid]
  if (!m) { E(`${mid}: content.json에 없다`); continue }
  for (const k of ['module_id','world','order','title_ko','subtitle_ko','emoji','xp_module_clear','estimated_minutes','steps','review_cards','boss'])
    if (m[k] === undefined) E(`${mid}: 필수 키 없음 ${k}`)
  if (m.module_id !== mid) E(`${mid}: module_id 불일치 ${m.module_id}`)
  // v1.4.42 재정렬: P→6 W→7 S→8 G→9 (옛 7~10). 여기 숫자가 낡으면 관제실 C2 같은 사고가 재발한다(L60).
  const world = mid[0] === 'P' ? 6 : mid[0] === 'W' ? 7 : mid[0] === 'S' ? 8 : 9
  if (m.world !== world) E(`${mid}: world ${m.world} (기대 ${world})`)
  if (m.order !== Number(mid[1])) E(`${mid}: order ${m.order}`)

  // v1.4.24 — `summon`(🔮 문장 소환)은 문법 단원에만 붙는 **선택 스텝**이다. 골격 비교에서는 빼고,
  // 자리·개수는 summon_check.mjs가 따로 본다. (문법을 다루는 단원에만 넣는 것이 규칙이므로
  // P3~P6·W*·S*에는 없는 것이 정상이다.)
  const shape = m.steps.filter(s => s.type !== 'summon').map(s => s.type === 'game' ? `game:${s.kind}` : s.type)
  const exp = mid[0] === 'S' ? SPK : STD
  if (shape.join('|') !== exp.join('|')) E(`${mid}: steps 구조 불일치 → ${shape.join(', ')}`)

  const u = { 고르기: 0, 조립: 0, 짝짓기: 0, 말하기: 0 }
  const pos = [0,0,0,0]
  const checkChoice = (arr, where) => {
    for (const it of arr) {
      const i = it.id || '?'
      if (ids.has(i)) E(`${mid}: id 중복 ${i}`); ids.add(i)
      if (!Array.isArray(it.choices) || it.choices.length !== 4) E(`${mid}/${i}: choices ${it.choices?.length}개`)
      else if (new Set(it.choices).size !== 4) E(`${mid}/${i}: 보기 문자열 중복`)
      if (!Number.isInteger(it.answer_idx) || it.answer_idx < 0 || it.answer_idx > 3) E(`${mid}/${i}: answer_idx ${it.answer_idx}`)
      else { pos[it.answer_idx]++; posAll[it.answer_idx]++ }
      if (!it.q_ko) E(`${mid}/${i}: q_ko 없음`)
      if (!it.explain_ko) E(`${mid}/${i}: explain_ko 없음`)
      if ('tts' in it && it.tts === null) E(`${mid}/${i}: tts null (필드를 빼야 함)`)
      if (!!it.tts !== !!it.voice) E(`${mid}/${i}: tts↔voice 짝 불일치`)
      if (it.tts) { playable++; ttsTexts.add(it.tts); if (SYM.test(it.tts)) E(`${mid}/${i}: tts에 화면 기호 "${it.tts}"`) }
      if (it.meme_correct && it.meme_correct.length > 40) W(`${mid}/${i}: meme_correct 김(${it.meme_correct.length}자)`)
    }
  }
  for (const s of m.steps) {
    if (s.type === 'game' && (s.kind === 'choice' || s.kind === 'listen_choice')) { checkChoice(s.items); u.고르기 += s.items.length }
    else if (s.type === 'quiz') { checkChoice(s.questions); u.고르기 += s.questions.length }
    else if (s.type === 'game' && s.kind === 'order') {
      u.조립 += s.items.length
      for (const it of s.items) {
        const i = it.id || '?'
        if (ids.has(i)) E(`${mid}: id 중복 ${i}`); ids.add(i)
        const joined = (it.tokens || []).join(' ')
        if (joined !== it.answer) E(`${mid}/${i}: tokens≠answer  [${joined}] vs [${it.answer}]`)
        if (!(it.tokens?.length >= 2 && it.tokens.length <= 7)) W(`${mid}/${i}: tokens ${it.tokens?.length}개`)
        if (!!it.tts !== !!it.voice) E(`${mid}/${i}: tts↔voice 짝 불일치`)
        if (it.tts) { playable++; ttsTexts.add(it.tts); if (SYM.test(it.tts)) E(`${mid}/${i}: tts 화면기호`) }
      }
    }
    else if (s.type === 'game' && s.kind === 'match') {
      const list = Array.isArray(s.items) ? s.items : [s.items]
      if (list.length !== 1) E(`${mid}: match items 구조 (${list.length})`)
      const pr = list[0]?.pairs || []
      if (pr.length !== 6) E(`${mid}: match pairs ${pr.length}쌍`)
      if (new Set(pr.map(p => p.left)).size !== pr.length) E(`${mid}: match left 중복`)
      if (new Set(pr.map(p => p.right)).size !== pr.length) E(`${mid}: match right 중복`)
      for (const p of pr) {
        if (!!p.tts !== !!p.voice) E(`${mid}: match tts↔voice 짝 (${p.left})`)
        if (p.tts) { playable++; ttsTexts.add(p.tts) }
      }
      u.짝짓기 += pr.length
    }
    else if (s.type === 'speak') {
      u.말하기++
      for (const k of ['mission_ko','target_en','tts']) if (!s[k]) E(`${mid}: speak ${k} 없음`)
      if (!!s.tts !== !!s.voice) E(`${mid}: speak tts↔voice 짝`)
      if (s.tts) { playable++; ttsTexts.add(s.tts); if (SYM.test(s.tts)) E(`${mid}: speak tts 화면기호`) }
    }
    else if (s.type === 'learn') {
      const ex = s.card?.examples || []
      if (ex.length < 4 || ex.length > 6) W(`${mid}: learn examples ${ex.length}개`)
      if (!s.card?.rule_ko) E(`${mid}: learn rule_ko 없음`)
      if ((s.card?.rule_ko || '').length > 320) W(`${mid}: rule_ko 김(${s.card.rule_ko.length}자)`)
      for (const e of ex) {
        if (!!e.tts !== !!e.voice) E(`${mid}: learn tts↔voice 짝 (${e.en})`)
        if (e.tts) { playable++; ttsTexts.add(e.tts); if (SYM.test(e.tts)) E(`${mid}: learn tts 화면기호 "${e.tts}"`) }
      }
    }
    else if (s.type === 'story') {
      if (!s.lines?.length || s.lines.length > 5) W(`${mid}: story lines ${s.lines?.length}`)
      for (const l of s.lines || []) if (!l.text_ko) E(`${mid}: story text_ko 없음`)
    }
  }
  for (let a = 0; a < 4; a++) if (pos[a] < 2) E(`${mid}: answer_idx ${a} 가 ${pos[a]}번뿐 (최소 2)`)

  if (m.review_cards.length !== 12) E(`${mid}: review_cards ${m.review_cards.length}장`)
  for (const c of m.review_cards) {
    if (cards.has(c.card_id)) E(`${mid}: card_id 중복 ${c.card_id}`); cards.add(c.card_id)
    if (!c.front || !c.back) E(`${mid}: card ${c.card_id} 앞/뒤 누락`)
    if (!!c.tts !== !!c.voice) E(`${mid}: card tts↔voice 짝 (${c.card_id})`)
    if (c.tts) { playable++; ttsTexts.add(c.tts) }
  }
  if (!m.boss?.title_ko || !m.boss?.intro_ko) E(`${mid}: boss 제목/도입 누락`)
  if (m.boss.questions.length !== 8) E(`${mid}: boss ${m.boss.questions.length}문항`)
  checkChoice(m.boss.questions)
  units[mid] = u
}

// 금지 문구 스캔
const BAN = ['감점','이것도 몰라','똑똑하','머리가 좋','바보','멍청','친구들보다','다른 애들보다','남들보다','틀렸잖아']
for (const f of files) {
  const raw = JSON.stringify(base.modules[f.replace('.json', '')] ?? {})
  for (const b of BAN) if (raw.includes(b)) E(`${f}: 금지 표현 "${b}" 발견`)
}

console.log('=== 모듈별 채점 유닛 ===')
let tot = { 고르기: 0, 조립: 0, 짝짓기: 0, 말하기: 0 }
for (const k of Object.keys(units).sort()) {
  const u = units[k]; const s = u.고르기 + u.조립 + u.짝짓기 + u.말하기
  for (const x of Object.keys(tot)) tot[x] += u[x]
  console.log(` ${k}  고르기 ${u.고르기} · 조립 ${u.조립} · 짝짓기 ${u.짝짓기} · 말하기 ${u.말하기}  = ${s}`)
}
const T = tot.고르기 + tot.조립 + tot.짝짓기 + tot.말하기
console.log(`\n합계 ${T}유닛 — 고르기 ${tot.고르기}(${(tot.고르기/T*100).toFixed(1)}%) · 조립 ${tot.조립} · 짝짓기 ${tot.짝짓기} · 말하기 ${tot.말하기}`)
const P = posAll.reduce((a,b)=>a+b,0)
console.log(`정답 위치 분포: ${posAll.map(x=>(x/P*100).toFixed(2)+'%').join(' / ')} (n=${P})`)
posAll.forEach((x,i)=>{ const p=x/P*100; if (p<20||p>30) E(`정답 위치 ${i+1}번 칸 ${p.toFixed(2)}% (25%±5%p 벗어남)`) })
console.log(`재생 항목 ${playable}개 · 고유 tts 문장 ${ttsTexts.size}개`)

console.log(`\n=== 오류 ${errs.length} ===`)
errs.slice(0,80).forEach(e=>console.log(' ❌', e))
console.log(`=== 경고 ${warns.length} ===`)
warns.slice(0,30).forEach(w=>console.log(' ⚠', w))
if (errs.length) process.exit(1)
console.log('\n✅ 월드 7~10 콘텐츠 기계 검증 전 항목 통과')
