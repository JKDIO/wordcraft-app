// 🔮 문장 소환 렌더·계측 스모크 (v1.4.24)
//
// 이 스모크가 존재하는 이유는 딱 두 가지다. 둘 다 v1.4.2에서 고쳤다가 소스 재구성 때 되돌아갔고,
// 되돌아간 것을 아무도 몰랐다(L27). 다음엔 검사가 잡는다. "기억하지 말고 돌려라."
//   ① 레이아웃: 무대 < 조립 슬롯 < ⚡소환 버튼 < 블록 창고 (버튼이 팔레트 아래로 내려가면 실패)
//   ② 문장↔애니메이션 일치: "The cake explodes"면 케이크가 터진다(폭탄몬 아님)
//                          "The dog eats the cat"이면 고양이를 먹는다(케이크 아님)
import { chromium } from 'playwright'
import fs from 'fs'

const HARNESS = 'http://127.0.0.1:8098/index.html'
const APP = 'http://127.0.0.1:8099'
const fails = [], oks = []
const ok = m => { oks.push(m); console.log('  ✅ ' + m) }
const bad = m => { fails.push(m); console.log('  ❌ ' + m) }

/* 캐릭터 픽셀 팔레트 지문 — src/lib/forgeStage.ts CHARS 와 1:1 */
const SIG = { zombie: '#7ac74f', bomb: '#3ecf6e', cake: '#e0455a', dog: '#d9a066', cat: '#7d84a3' }
const PREY_SIG = { zombie: '#7ac74f', bomb: '#3ecf6e', cake: '#f4a7b9', dog: '#d9a066', cat: '#7d84a3' }
const CAKE_PROP = '#f4a7b9' // 기본 케이크 소품의 분홍 — 목적어가 있는데 이게 나오면 v1.4.2 결함 재발
const rgb = h => { const n = parseInt(h.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})` }

const items = JSON.parse(fs.readFileSync('.verify/summon_items.json', 'utf8'))
const sceneItems = items.filter(i => i.scene)

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const jsErrors = []
page.on('pageerror', e => jsErrors.push(String(e)))
page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource|supabase/i.test(m.text())) jsErrors.push(m.text()) })
await page.addInitScript(() => {
  HTMLMediaElement.prototype.play = function () { return Promise.resolve() }
})

await page.goto(HARNESS, { waitUntil: 'networkidle' })
await page.waitForSelector('.summon-step', { timeout: 15000 })

/** 정답 토큰을 순서대로 눌러 조립하고 ⚡소환 */
async function assemble(item) {
  const toks = [...item.tokens].sort((a, b) => b.length - a.length)
  const parts = []
  let rest = item.answer.trim()
  while (rest.length) {
    const t = toks.find(t => rest === t || rest.startsWith(t + ' '))
    if (!t) break
    parts.push(t); rest = rest === t ? '' : rest.slice(t.length + 1)
  }
  if (parts.join(' ') !== item.answer.trim()) return false
  for (const t of parts) {
    const btn = page.locator('.summon-step .order-pool button').filter({ hasText: new RegExp('^\\s*' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$') }).first()
    if (!(await btn.count())) return false
    await btn.click()
  }
  await page.locator('.summon-step .forge-summon').click()
  return true
}

async function show(idx) {
  await page.evaluate(n => globalThis.__go(n), idx)
  await page.waitForTimeout(150)
  await page.waitForSelector('.summon-step .order-pool button', { timeout: 8000 })
}

/* ───── ① 레이아웃 회귀 검사 (전 66문항) ───── */
let layoutBad = 0
for (let i = 0; i < items.length; i++) {
  await show(i)
  const b = await page.evaluate(() => {
    const y = s => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top) : null }
    return { stage: y('.summon-step .forge-stage-box'), slots: y('.summon-step .forge-slots'), btn: y('.summon-step .forge-summon'), pool: y('.summon-step .order-pool') }
  })
  if (!(b.stage != null && b.slots != null && b.btn != null && b.pool != null &&
        b.stage < b.slots && b.slots < b.btn && b.btn < b.pool)) {
    bad(`레이아웃 회귀 ${items[i].id}: ${JSON.stringify(b)}`); layoutBad++
  }
}
if (!layoutBad) ok(`레이아웃 순서 정상 ${items.length}/${items.length} — 무대 < 슬롯 < ⚡소환 < 블록창고`)

/* ───── ② 문장 ↔ 애니메이션 일치 (scene 전수) ───── */
let sceneBad = 0
for (const it of sceneItems) {
  const idx = items.findIndex(x => x.id === it.id)
  await show(idx)
  // ⚠️ fast(1.7배)면 애니메이션이 ~560ms에 끝난다 — 한 시점만 찍으면 놓친다.
  //    소환 직전부터 40ms 간격으로 계속 표본을 모아 **관측의 합집합**으로 판정한다.
  // ⚠️ 표본을 합집합으로 합치면 안 된다 — 소환 직전의 옛 배역까지 섞여서
  //    "잘못된 배역으로 동작이 재생됐다"를 놓친다(실제로 처음 이렇게 짰다가 explode 결함을 못 잡았다).
  //    판정 기준은 **"동사 클래스가 붙어 있는 그 순간의 배역"** — 시점별 쌍으로 모은다.
  await page.evaluate(() => {
    globalThis.__obs = []
    clearInterval(globalThis.__t)
    globalThis.__t = setInterval(() => {
      const st = document.querySelector('.summon-step .stage')
      if (!st) return
      const g = e => (e ? getComputedStyle(e).boxShadow : null)
      globalThis.__obs.push({
        cls: st.className,
        main: g(st.querySelector('.slot.main .px')),
        prey: g(st.querySelector('.prop-layer .pcake .px')),
        friend: g(st.querySelector('.slot.friend .px')),
      })
    }, 40)
  })
  if (!(await assemble(it))) { bad(`${it.id}: 정답 조립 실패(토큰 불일치)`); sceneBad++; continue }
  await page.waitForTimeout(2600)
  const obs = await page.evaluate(() => { clearInterval(globalThis.__t); return globalThis.__obs })
  if (!obs || !obs.length) { bad(`${it.id}: 무대 DOM 없음`); sceneBad++; continue }

  const p = []
  const acting = obs.filter(o => o.cls.includes('v-' + it.scene.verb))   // 동사가 재생 중인 순간들
  if (!acting.length) { p.push(`동사 v-${it.scene.verb} 미적용 (관측 ${obs.length}표본)`) }
  else {
    const wantMain = rgb(SIG[it.scene.actor])
    // ★핵심 판정★ 동작이 재생되는 모든 순간에 주인공은 문장의 주어여야 한다
    const wrongActor = acting.filter(o => !o.main || !o.main.includes(wantMain))
    if (wrongActor.length)
      p.push(`★동작 중 주인공이 ${it.scene.actor}가 아니다 (${wrongActor.length}/${acting.length} 표본) — 문장과 화면 불일치★`)

    if (it.scene.verb === 'eat') {
      const withPrey = acting.filter(o => o.prey)
      if (!withPrey.length) p.push('먹잇감 스프라이트 없음')
      else if (it.scene.object) {
        const wantPrey = rgb(PREY_SIG[it.scene.object])
        if (!withPrey.some(o => o.prey.includes(wantPrey)))
          p.push(`★먹잇감이 ${it.scene.object}가 아니다 (v1.4.2 결함 재발)★`)
        if (it.scene.object !== 'cake' && withPrey.every(o => o.prey.includes(rgb(CAKE_PROP)) && !o.prey.includes(wantPrey)))
          p.push('★먹잇감이 기본 케이크 소품으로 고정됐다★')
      }
    }
    if (it.scene.verb === 'hug' && it.scene.object) {
      const wantFriend = rgb(SIG[it.scene.object])
      if (!acting.some(o => o.friend && o.friend.includes(wantFriend)))
        p.push(`★파트너가 ${it.scene.object}가 아니다★`)
    }
    if (it.scene.speed && it.scene.speed < 1) {
      // slowly면 실제로 느려야 한다 — 동작 구간이 기본보다 길게 관측돼야 한다
      if (acting.length < 12) p.push(`slowly인데 동작 구간이 짧다 (${acting.length}표본 · 기대 ≥12)`)
    }
  }
  if (p.length) { bad(`${it.id} "${it.answer}" → ${p.join(' / ')}`); sceneBad++ }
}
if (!sceneBad && sceneItems.length) ok(`문장↔애니메이션 일치 ${sceneItems.length}/${sceneItems.length} (주인공·동작·먹잇감·파트너 전수)`)

/* ───── ③ 오답 진단이 실제로 뜨는가 (아이가 막히지 않게) ───── */
await show(items.findIndex(x => x.scene))
{
  const first = items.find(x => x.scene)
  const btns = page.locator('.summon-step .order-pool button')
  const n = await btns.count()
  for (let i = n - 1; i >= 0 && i > n - 4; i--) await btns.nth(i).click()   // 일부러 뒤죽박죽
  await page.locator('.summon-step .forge-summon').click()
  await page.waitForTimeout(1500)
  const fb = await page.locator('.summon-step .feedback').innerText().catch(() => '')
  fb && /소환 실패|마법진이 흔들|문법은 완벽/.test(fb)
    ? ok(`오답 진단 표시됨 — "${fb.split('\n')[0].slice(0, 40)}…"`)
    : bad(`오답 진단이 안 뜬다 (${first.id}): "${fb}"`)
}

/* ───── ④ 문장 각인(scene 없는 문항)이 실제로 그려지는가 ───── */
{
  const eng = items.find(x => !x.scene)
  await show(items.findIndex(x => x.id === eng.id))
  await assemble(eng)
  await page.waitForTimeout(900)
  const chunks = await page.locator('.summon-step .fx.p-chunk').count()
  chunks > 0 ? ok(`문장 각인 연출 동작 (덩어리 ${chunks}개 표시) — 재현 불가 문장에 거짓 애니메이션 없음`)
             : bad('문장 각인 연출이 그려지지 않는다')
}

/* ───── ⑤ 앱 전체 라우트 렌더 + 옛 소환진 제거 확인 ───── */
const page2 = await ctx.newPage()
const jsErr2 = []
page2.on('pageerror', e => jsErr2.push(String(e)))
for (const r of ['/', '/#/review', '/#/profile', '/#/runes', '/#/listen', '/#/rewards', '/#/dex', '/#/admin', '/#/forge']) {
  await page2.goto(APP + r, { waitUntil: 'domcontentloaded' })
  await page2.waitForTimeout(400)
}
await page2.goto(APP + '/', { waitUntil: 'networkidle' })
await page2.waitForTimeout(700)
const html = await page2.content()
!/문장 소환진 공방|forge-entry/.test(html) ? ok('월드맵에서 월드 6 입구 제거됨') : bad('★월드맵에 월드 6 입구가 남아 있다★')
jsErr2.length === 0 ? ok('앱 9라우트 렌더 · JS 에러 0') : bad('앱 JS 에러: ' + jsErr2.slice(0, 3).join(' | '))
jsErrors.length === 0 ? ok('하네스 JS 에러 0') : bad('하네스 JS 에러: ' + jsErrors.slice(0, 3).join(' | '))

await browser.close()
console.log(`\n=== 결과: 통과 ${oks.length} · 실패 ${fails.length} ===`)
if (fails.length) process.exit(1)
console.log('✅ 문장 소환 스모크 전 항목 통과')
