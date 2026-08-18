/** isolated_render.mjs — 격리 실기 검증 하네스 (v1.4.45 확립 · ★v1.4.46에서 저장소에 상비★)
 *
 * ═══ 왜 상비하는가 (L63-2) ════════════════════════════════════════════════
 * 이 앱은 **라이브 학습자 화면 `#/`를 여는 것만으로 아이 데이터를 오염시켰다**(C5).
 * 그래서 "배포했으니 앱을 열어 보자"(L54-5)를 그대로 하면 검증 대상을 망친다.
 * v1.4.45에서 격리 하네스를 만들어 11/11을 봤지만 **그 하네스는 컨테이너와 함께 사라졌다** —
 * 다음 세션이 또 처음부터 만들어야 했다. 그래서 이번엔 저장소에 둔다.
 *
 * ★v1.4.46부터는 C5가 봉합돼 데스크탑에서 열어도 쓰지 않는다.★ 그래도 이 하네스는 그대로 쓴다:
 *   ① 실 DB에 의존하지 않으니 언제든 재현 가능하고 ② 픽스처를 바꿔 극단 상황을 만들 수 있고
 *   ③ **C5 봉합 자체를 검증하려면** 쓰기가 나가는지 실제로 지켜봐야 하기 때문이다.
 *
 * ═══ 규칙 ═══════════════════════════════════════════════════════════════
 * · Supabase로 가는 **비-GET(쓰기)은 전부 가로챈다.** 통과시키지 않고, 시도 자체를 센다.
 * · SPA 이동은 `location.hash` (리로드하면 localStorage 상태가 날아간다 — L63-4)
 * · 픽스처는 실제 DB와 **같은 모양**으로 만든다. 특히 `W:CMD:` 접두사처럼 분기를 만드는 필드(L63-3).
 *
 * 사용:
 *   bash build_dist.sh   (또는 bun build + public 복사)
 *   node isolated_render.mjs
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join } from 'node:path'

/* ── ① CI와 똑같은 배포물을 만든다 (main.js + app.css = public/app.css + css.d/*) ── */
const ROOT = '.verify/site'
mkdirSync(ROOT, { recursive: true })
if (!existsSync('dist/main.js')) { console.error('dist/main.js 없음 — 먼저 빌드할 것'); process.exit(1) }
cpSync('dist/main.js', `${ROOT}/main.js`)
cpSync('index.html', `${ROOT}/index.html`)
for (const f of ['content.json', 'vocab.json']) cpSync(`public/${f}`, `${ROOT}/${f}`)
cpSync('../version.json', `${ROOT}/version.json`)
{
  let css = readFileSync('public/app.css', 'utf8')
  for (const f of readdirSync('public/css.d').sort()) css += readFileSync(`public/css.d/${f}`, 'utf8')
  writeFileSync(`${ROOT}/app.css`, css)
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }
const server = createServer((req, res) => {
  const p = decodeURIComponent((req.url || '/').split('?')[0])
  const f = join(ROOT, p === '/' ? 'index.html' : p)
  try {
    const b = readFileSync(f)
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream' })
    res.end(b)
  } catch { res.writeHead(404); res.end('nope') }
})
await new Promise(r => server.listen(8899, r))
const APP = 'http://127.0.0.1:8899'

/* ── ② 픽스처 — 예한이 실제 DB 값의 모양 그대로 ── */
const LID = '177e3fe3-487b-489a-b38a-07d6255d9b93'
const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
const learner = { id: LID, nickname: '예한', xp: 46729, level: 18, streak_days: 0, last_active_date: '2026-08-15', family_code: 'wc-yehan-7351' }
const cards = []
// 지령 카드(앞면이 범용 문구인 그 17장 계열) — 분기를 만드는 필드다(L63-3)
cards.push({ id: 1, card_id: 'W:CMD:CMD-002', card_front: '본부에서 긴급 지령! 잘 들어봐, 뭘 하라는 거야?', card_back: '👂 귀 만지기', box: 1, due_date: today, review_count: 0, last_result: false })
cards.push({ id: 2, card_id: 'W:CMD:CMD-006', card_front: '본부에서 긴급 지령! 잘 들어봐, 뭘 하라는 거야?', card_back: '🖐️ 책상 두드리기', box: 1, due_date: today, review_count: 0, last_result: false })
for (let i = 3; i <= 120; i++) {
  cards.push({ id: i, card_id: `C6-C${String(i).padStart(2, '0')}`, card_front: `앞면 ${i}`, card_back: `뒷면 ${i}`, box: 2 + (i % 3), due_date: today, review_count: 2, last_result: true })
}

let writes = []           // 실 DB로 나갈 뻔한 쓰기 (전부 가로챔)
let rpcCalls = []         // RPC 호출 이름

function restBody(url) {
  const u = new URL(url)
  const table = u.pathname.split('/rest/v1/')[1]?.split('?')[0] || ''
  if (table === 'learners') return [learner]
  if (table === 'review_cards') return u.searchParams.get('select') === 'box' ? cards.map(c => ({ box: c.box })) : cards
  if (table === 'module_progress') return []
  if (table === 'answer_events') return []
  if (table === 'sessions') return []
  if (table === 'badges') return []
  if (table === 'memberships') return []
  if (table === 'reward_goals') return []
  if (table === 'xp_events') return []
  return []
}

const browser = await chromium.launch()
let fail = 0, pass = 0
const ok = (c, n, e = '') => { if (c) { console.log(`  ✓ ${n}`); pass++ } else { console.log(`  ✗ ${n} ${e}`); fail++ } }

async function makePage({ mobile }) {
  const ctx = await browser.newContext({
    viewport: mobile ? { width: 393, height: 851 } : { width: 1280, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    timezoneId: 'Asia/Seoul',
    userAgent: mobile
      ? 'Mozilla/5.0 (Linux; Android 13; SM-A245N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  })
  writes = []; rpcCalls = []
  await ctx.route(/supabase\.co\//, async route => {
    const req = route.request()
    const url = req.url()
    const method = req.method()
    if (/\/rpc\//.test(url)) {
      rpcCalls.push({ fn: url.split('/rpc/')[1], method, body: req.postData() })
      const fn = url.split('/rpc/')[1]
      if (fn === 'wc_review_grade') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ day: today, graded_count: 0 }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
    }
    if (/\/auth\/v1\//.test(url)) return route.fulfill({ status: 401, contentType: 'application/json', body: '{}' })
    if (method !== 'GET') {                       // ★쓰기는 절대 통과시키지 않는다★
      writes.push({ url, method, body: req.postData() })
      return route.fulfill({ status: 201, contentType: 'application/json', body: '[]' })
    }
    return route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'content-range': '0-0/0' }, body: JSON.stringify(restBody(url)) })
  })
  const page = await ctx.newPage()
  page.on('pageerror', e => { console.log('    ! JS 에러:', String(e).slice(0, 160)); fail++ })
  // 레거시 예한이 기기 상태를 심는다 (learnerId 보유 · 인증 세션 없음)
  await page.addInitScript(([lid]) => {
    localStorage.setItem('wordcraft_state_v1', JSON.stringify({
      learnerId: lid, nickname: '예한', xp: 46729, level: 18, streak_days: 0,
      last_active_date: '2026-08-15', attendance: [], diagDone: ['D1', 'D2', 'D3', 'D4'], placement: 'C0',
      progress: {}, sessionId: null, sessionStart: null,
    }))
  }, [LID])
  return { ctx, page }
}

const go = async (page, hash) => { await page.evaluate(h => { location.hash = h }, hash); await page.waitForTimeout(700) }

/* ═══ A. 모바일(예한이 폰 모사) ═══════════════════════════════════════════ */
console.log('── A. 모바일 (갤럭시 A24 모사) ──')
{
  const { ctx, page } = await makePage({ mobile: true })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)

  ok(!(await page.locator('.wc-observer-bar').count()), '★모바일에는 구경 모드 띠가 안 뜬다 (아이 경험 무변화)')
  ok(writes.some(w => /\/sessions/.test(w.url) && w.method === 'POST'), '★모바일에서는 세션이 정상 생성된다 (학습 기록이 계속 남는다)')
  ok(rpcCalls.some(r => r.fn.startsWith('wc_device_check')), '★★A24 자가진단이 실제로 보고된다 (L8 — 여덟 릴리스 만에 관측됨)')

  await go(page, '/info')
  const infoTxt = await page.locator('.appinfo').innerText()
  ok(/v1\.4\.46/.test(infoTxt), '정보 탭 버전 = 1.4.46', infoTxt.slice(0, 80))
  ok(/학습 기기 \(기록 저장함\)/.test(infoTxt), '정보 탭이 이 기기를 학습 기기로 표시')
  ok(/실기기 자가진단/.test(infoTxt), '자가진단 카드가 실제로 그려진다')
  ok(/스피커에서 진짜로 소리가 났는지는 앱이 알 수 없어요/.test(infoTxt), '★한계를 화면이 정직하게 말한다 (기계가 못 하는 칸을 감추지 않는다)')

  /* ── ★C1★ 화면에 실제로 그려진 보기 순서가 만날 때마다 바뀌는가 ──
     "검사 통과"와 "화면에 실제로 보인다"는 다른 사실이다(L63-1). shuffle_check는 함수를 쟀고,
     여기서는 **아이가 보는 픽셀**을 잰다. 모듈 세션은 story→learn→game 순서라 문항까지 걸어 들어가야 한다. */
  const advanceToQuestion = async () => {
    for (let step = 0; step < 60; step++) {
      if (await page.locator('.qcard .choice-btn').count()) return true
      const b1 = page.locator('.btn.primary:visible, .btn.secondary:visible, .wc-go:visible').first()
      if (await b1.count()) await b1.click({ timeout: 2500 }).catch(() => {})
      else if (await page.locator('.story').count()) await page.locator('.story').click({ timeout: 2500 }).catch(() => {})
      else break
      await page.waitForTimeout(140)
    }
    return !!(await page.locator('.qcard .choice-btn').count())
  }
  const readCard = () => page.evaluate(() => {
    const q = document.querySelector('.qcard')
    if (!q) return null
    return {
      text: (q.querySelector('.qcard-text')?.textContent || '').trim(),
      choices: [...q.querySelectorAll('.choice-btn')].map(b => b.textContent.replace(/^[A-D]/, '').replace(/[◆✔✕]|정답/g, '').trim()),
    }
  })

  const orders = []
  for (let round = 0; round < 6; round++) {
    await go(page, '/module/A1')
    await page.waitForTimeout(500)
    if (await advanceToQuestion()) { const c = await readCard(); if (c) orders.push(c) }
    await go(page, '/')
    await page.waitForTimeout(250)
  }
  ok(orders.length >= 4 && orders[0].choices.length === 4, `문항 카드를 ${orders.length}번 그렸다`, JSON.stringify(orders[0] || {}).slice(0, 160))
  if (orders.length >= 4) {
    const same = orders.every(o => o.text === orders[0].text)
    ok(same, '★매번 같은 문항을 만났다 (비교 조건 성립)')
    const variants = new Set(orders.map(o => o.choices.join('|')))
    console.log('    관측한 보기 순서:', [...variants].join('   /   '))
    ok(variants.size >= 2,
      `★★같은 문항인데 보기 순서가 ${variants.size}가지로 나왔다 — C1이 화면에서 실제로 작동한다★★`)
    ok(orders.every(o => new Set(o.choices).size === 4 && o.choices.every(c => orders[0].choices.includes(c))),
      '★보기 내용은 그대로다 (유실·중복 없이 자리만 바뀐다)')
    // 정답 위치가 한 자리에 고정돼 있지 않다 — 정답 문자열을 알므로 자리를 직접 센다
    const answerText = await page.evaluate(async () => {
      const D = await (await fetch('/content.json')).json()
      let hit = null
      const walk = (n) => { if (hit) return
        if (Array.isArray(n)) { for (const v of n) walk(v); return }
        if (n && typeof n === 'object') {
          if (Array.isArray(n.choices) && n.choices.length === 4 && Number.isInteger(n.answer_idx) && /ball/.test(n.q_ko || '')) { hit = n.choices[n.answer_idx]; return }
          for (const v of Object.values(n)) walk(v) } }
      walk(D.modules.A1)
      return hit
    })
    if (answerText) {
      const pos = new Set(orders.map(o => o.choices.indexOf(answerText)))
      console.log(`    정답("${answerText}")이 앉은 자리:`, [...pos].map(x => 'ABCD'[x] ?? '?').join(','))
      ok(pos.size >= 2, '★정답이 항상 같은 자리에 앉지 않는다 (찍기로 못 맞힌다)')
    }
  }

  /* ── L61: 광산 입구가 서버 회계를 호출하는가 · 지령 카드 앞면 🔊 (v1.4.45 회귀) ── */
  rpcCalls = []
  await go(page, '/review')
  await page.waitForTimeout(1200)
  ok(rpcCalls.some(r => r.fn.startsWith('wc_review_grade')), '★★광산 입구가 서버 일일 회계를 조회한다 (L61)')
  const entrance = await page.locator('.reviewmine').innerText().catch(() => '')
  ok(/오늘 몫 60장/.test(entrance), '★오늘 몫이 상한 60장이다', entrance.slice(0, 120))
  ok(/하루에 <?60장?/.test(entrance) || /60장/.test(entrance), '입구 문구가 상한을 말한다')
  await page.locator('.wc-go').click()
  await page.waitForTimeout(900)
  const front = await page.locator('.flashcard').innerText().catch(() => '')
  ok(/본부에서 긴급 지령/.test(front), '★지령 카드가 맨 앞(리스폰)에 온다 — 오답 우선 정렬')
  ok(await page.locator('.flash-listen').count() > 0, '★★지령 카드 앞면에 🔊 듣기 버튼이 있다 (v1.4.45 봉합 유지)')

  await ctx.close()
}

/* ═══ B. 데스크탑(아빠 PC 모사) — C5의 실제 오염 경로 ═══════════════════ */
console.log('── B. 데스크탑 (아빠 PC 모사) ──')
{
  const { ctx, page } = await makePage({ mobile: false })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForTimeout(2200)

  ok(!writes.some(w => /\/sessions/.test(w.url) && w.method === 'POST'),
    '★★★아빠 PC에서 학습자 화면을 열어도 sessions INSERT가 나가지 않는다 — C5 봉합★★★',
    JSON.stringify(writes.map(w => w.method + ' ' + w.url.split('/rest/v1/')[1]).slice(0, 5)))
  ok(writes.length === 0, '★쓰기 시도 자체가 0건이다', `${writes.length}건: ${JSON.stringify(writes.slice(0, 3))}`)
  ok(!rpcCalls.some(r => r.fn.startsWith('wc_device_check')), '★구경 모드에서는 자가진단도 보내지 않는다 (아빠 PC 값이 아이 기록에 안 섞인다)')
  ok(await page.locator('.wc-observer-bar').count() > 0, '★★구경 모드 띠가 뜬다 — 조용히 막지 않는다(L47)')
  const bar = await page.locator('.wc-observer-bar').innerText()
  ok(/아이 기록에 저장하지 않습니다/.test(bar), '띠가 무엇이 막혔는지 말한다', bar.slice(0, 100))
  ok(/이 기기에서 공부할래요/.test(bar), '★푸는 방법도 같은 자리에 있다')

  // 한 번 누르면 학습 기기가 된다 (아이를 막지 않는다)
  await page.locator('.wc-observer-btn').click()
  await page.waitForTimeout(500)
  ok(!(await page.locator('.wc-observer-bar').count()), '★버튼을 누르면 띠가 사라진다 (그 자리에서 전환)')
  const role = await page.evaluate(() => localStorage.getItem('wordcraft_device_role_v1'))
  ok(role === 'learner', '★선택이 이 기기에 기억된다 (다시 묻지 않는다)')

  await ctx.close()
}

await browser.close()
server.close()
console.log(`\n격리 실기 검증 — 통과 ${pass} · 실패 ${fail}`)
process.exit(fail === 0 ? 0 : 1)
