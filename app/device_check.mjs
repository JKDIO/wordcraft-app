/** device_check.mjs — 기기 게이트(C5) + 서버 일일 회계(L61) + 실기기 자가진단(L8) 봉인 (v1.4.46 신설)
 *
 * ★왜★ 세 가지가 한 파일인 이유는 셋 다 **"어느 기기에서 무엇을 쓰는가"** 하나의 축이기 때문이다.
 *   · C5  — 아빠 PC에서 학습자 화면을 열면 아이 계정에 썼다(desktop 세션 75건, 최근 30건은 문항 0개).
 *   · L61 — 하루 상한의 분모가 localStorage라, 저장 실패·두 탭·기기 날짜 변경으로 상한이 무력화됐다.
 *   · L8  — A24 WebView 고유 동작이 여덟 릴리스 동안 "미검증"이었다. 이제 앱이 스스로 잰다.
 *
 * ★L59★ 존재가 아니라 **호출**을 본다. 그리고 라이브러리만이 아니라 **소비자**도 본다(L51).
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'

mkdirSync('.verify', { recursive: true })
writeFileSync('.verify/dv_entry.ts', `import * as DV from '../src/lib/device'\nimport * as DL from '../src/lib/dailyLedger'\nimport * as SC from '../src/lib/selfCheck'\n// @ts-ignore\nglobalThis.DV = DV; globalThis.DL = DL; globalThis.SC = SC\n`)

// ── 브라우저 셈 (localStorage / navigator) ───────────────────────────────
let store = {}
let throwOnWrite = false
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { if (throwOnWrite) throw new Error('QuotaExceeded'); store[k] = String(v) },
  removeItem: k => { delete store[k] },
}
let UA = 'Mozilla/5.0 (Linux; Android 13; SM-A245N) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
Object.defineProperty(globalThis, 'navigator', { configurable: true, get: () => ({ get userAgent() { return UA }, onLine: true }) })

execSync('/root/.bun/bin/bun build .verify/dv_entry.ts --outfile .verify/dv_bundle.js --target node', { stdio: 'inherit' })
await import('./.verify/dv_bundle.js')
const DV = globalThis.DV, DL = globalThis.DL

let fail = 0
const ok = (c, n, e = '') => { if (c) console.log(`  ✓ ${n}`); else { console.log(`  ✗ ${n} ${e}`); fail++ } }
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const src = f => strip(readFileSync(f, 'utf8'))
const reset = () => { store = {}; throwOnWrite = false; DL._resetLedger() }

console.log('── ① 기기 역할 판정 (C5) ──')
{
  reset()
  UA = 'Mozilla/5.0 (Linux; Android 13; SM-A245N) Chrome/120 Mobile Safari/537.36'
  ok(DV.isMobileUA() === true, '갤럭시 A24 UA를 모바일로 본다')
  ok(DV.deviceRole() === 'learner', '★모바일은 기본이 학습 기기 — 아이들에게는 아무 변화가 없다')
  ok(DV.writesAllowed() === true, '★모바일에서 서버 쓰기가 열려 있다')

  UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36'
  ok(DV.isMobileUA() === false, '윈도우 크롬 UA를 데스크탑으로 본다')
  ok(DV.deviceRole() === 'observer', '★★데스크탑은 기본이 구경 모드 — C5의 실제 오염 경로가 닫힌다')
  ok(DV.writesAllowed() === false, '★★데스크탑에서 서버 쓰기가 막힌다')

  DV.setDeviceRole('learner')
  ok(DV.writesAllowed() === true, '데스크탑에서도 한 번 누르면 학습 기기가 된다 (아이를 막지 않는다)')
  DV.setDeviceRole('observer')
  UA = 'Mozilla/5.0 (Linux; Android 13; SM-A245N) Chrome/120 Mobile Safari/537.36'
  ok(DV.writesAllowed() === false, '★모바일이라도 사람이 구경 모드를 고르면 그 선택이 이긴다')

  /* 보호자(구글) 기기는 어떤 경우에도 아이 기록을 만들지 않는다.
     ★2026-08-18 결함 주입에서 이 항목이 침묵했다★ — `reset()`이 가짜 localStorage만 비우고
     device.ts의 **메모리 사본(memRole)** 은 못 비워서, 직전 테스트의 'observer'가 남아 있었다.
     그래서 보호자 검사를 지워도 통과했다(옳은 결론, 틀린 이유). 하네스 결함이다(L63-4).
     → localStorage에 직접 쓰지 말고 setDeviceRole로 메모리까지 확실히 'learner'로 만든 뒤 판정한다. */
  reset()
  DV.setDeviceRole('learner')
  store['wordcraft_auth_kind_v1'] = 'guardian'
  ok(DV.deviceRole() === 'learner', '전제 — 이 기기는 학습 기기로 지정돼 있다')
  ok(DV.writesAllowed() === false, '★보호자 기기는 학습 기기로 지정돼 있어도 쓰지 않는다')
}

console.log('── ② 조용히 막지 않는다 (L47) ──')
{
  reset()
  UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'
  DV.noteBlockedWrite(); DV.noteBlockedWrite(); DV.noteBlockedWrite()
  ok(DV.blockedWrites() === 3, '막힌 쓰기 횟수를 센다')
  DV.setDeviceRole('learner')
  ok(DV.blockedWrites() === 0, '학습 기기로 바꾸면 흔적을 지운다 (다시 셈)')
  const app = src('src/App.tsx')
  ok(/showObserverBar &&/.test(app), '★App이 구경 모드 띠를 실제로 렌더한다 (L51 — 라이브러리만 고치면 소용없다)')
  ok(/setDeviceRole\('learner'\); setDevRole\('learner'\)/.test(app), '★띠의 버튼이 실제로 역할을 바꾼다')
  ok(/blockedWrites\(\) > 0 &&/.test(app), '★막힌 건수를 화면이 말한다')
  const info = src('src/screens/AppInfo.tsx')
  ok(/deviceRole\(\)/.test(info) && /setDeviceRole\(next\)/.test(info), '정보 탭에서도 역할을 확인·전환할 수 있다')
}

console.log('── ③ ★쓰기 관문이 store.ts에 실제로 걸려 있는가★ ──')
{
  const st = src('src/lib/store.ts')
  ok(/if \(!writesAllowed\(\)\) \{ noteBlockedWrite\(\); return \}\s*\n\s*const q = loadQueue\(\)/.test(st),
    '★★enqueue()가 큐에 넣기 전에 관문을 통과시킨다 (호출부 검사 — L59)')
  ok(/if \(writesAllowed\(\)\) \{[\s\S]{0,400}?db\.insert\('sessions'/.test(st),
    "★★startSession()의 sessions INSERT가 관문 안에 있다 (C5의 실제 오염 한 줄)")
  ok(/\} else \{\s*noteBlockedWrite\(\)\s*\}/.test(st), '세션 생성이 막힌 것도 흔적을 남긴다')
  ok(/from '\.\/device'/.test(st), 'store가 device 규칙을 import한다 (규칙을 여기서 다시 짜지 않는다)')
  ok(!/navigator\.userAgent\.includes\('Mobile'\)/.test(st), '★UA 판정을 store가 직접 하지 않는다 (규칙 복사 금지 — L27)')

  // 학습자 앱의 서버 쓰기가 enqueue / startSession 두 곳 말고 또 있는지 — 새 우회로가 생기면 여기서 운다.
  const learnerFiles = ['src/lib/store.ts', 'src/screens/ReviewMine.tsx', 'src/screens/VocabContinent.tsx',
    'src/screens/ListenArcade.tsx', 'src/screens/GhostBattle.tsx', 'src/screens/WorldMap.tsx',
    'src/screens/Profile.tsx', 'src/screens/RewardBoard.tsx', 'src/App.tsx', 'src/engine/StepRunner.tsx']
  let stray = []
  for (const f of learnerFiles) {
    const t = src(f)
    for (const m of t.matchAll(/db\.(insert|upsert|update|del)\(/g)) {
      // store.ts 안의 flushQueue(관문을 이미 지난 큐 소비)와 startSession/tickSession만 허용
      if (f === 'src/lib/store.ts') continue
      stray.push(`${f}: db.${m[1]}(`)
    }
  }
  ok(stray.length === 0, '★학습자 화면이 store를 우회해 직접 쓰지 않는다', stray.join(' / '))
}

console.log('── ④ 서버 일일 회계 (L61) ──')
{
  reset()
  UA = 'Mozilla/5.0 (Linux; Android 13; SM-A245N) Chrome/120 Mobile Safari/537.36'
  ok(DL.gradedToday() === 0, '시작은 0')
  DL.addGradedToday(); DL.addGradedToday()
  ok(DL.gradedToday() === 2, '로컬로 즉시 센다 (화면 반응은 서버를 기다리지 않는다)')
  ok(DL.pendingDelta() === 2, '★아직 서버가 모르는 증분을 기억한다 (오프라인에서 쌓였다가 나간다)')

  // 저장소가 죽은 기기 — 예전에는 카운터가 영원히 0이라 상한이 매번 리셋됐다(감사 지적 ①)
  reset()
  throwOnWrite = true
  DL.addGradedToday(); DL.addGradedToday(); DL.addGradedToday()
  ok(DL.gradedToday() === 3, '★★저장소가 죽어도 메모리로 정확히 센다 (상한이 사라지지 않는다)')
  ok(DL.storageBroken() === true, '★저장 실패를 삼키지 않고 표시한다 (L47·L61 규칙4)')
  const mine = src('src/screens/ReviewMine.tsx')
  ok(/storageBroken\(\) && \(/.test(mine), '★복습 광산이 그 사실을 화면에 말한다 (소비자 검사 — L51)')

  // 하위호환: v1.4.43~45가 남긴 { date, n } 값은 sent 없음 → 오늘 것을 두 번 세지 않는다
  reset()
  const today = new Date().toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
  store['wordcraft_review_graded_v1'] = JSON.stringify({ date: today, n: 17 })
  ok(DL.gradedToday() === 17, '옛 버전 값을 그대로 이어받는다')
  ok(DL.pendingDelta() === 0, '★옛 값을 서버로 다시 밀지 않는다 (중복 계상 방지)')

  const dl = src('src/lib/dailyLedger.ts')
  ok(/return Math\.max\(l\.n, serverMem\.n\)/.test(dl), '★★상한의 분모 = max(로컬, 서버) — 한쪽이 죽어도 상한이 남는다')
  ok(/rpc\('wc_review_grade', \{ p_learner_id: learnerId, p_delta: delta, p_req: req \}\)/.test(dl), '★서버 원자적 카운터를 실제로 호출한다')
  ok(/if \(!learnerId \|\| !writesAllowed\(\)\) return Promise\.resolve\(\)/.test(dl), '★구경 모드에서는 아이 상한을 소모하지 않는다')
  ok(/storageFailed = true/.test(dl), '★저장 실패를 기록한다')

  /* ── ★GPT 교차 감사(2026-08-18 job 26) 봉합 봉인★ ──
     감사가 치명 5건을 지적했고 전부 실재였다. 다시 열리지 않게 검사로 잠근다. */
  ok(/const scoped = \(base: string\) => \(learnerId \? `\$\{base\}:\$\{learnerId\}` : base\)/.test(dl),
    '★★저장소 키가 학습자별로 분리된다 (한 브라우저에서 아이를 바꿔도 카운터가 안 섞인다)')
  ok(/if \(next === learnerId\) return\s*\n\s*learnerId = next\s*\n\s*memLoaded = false/.test(dl),
    '★★학습자가 바뀌면 메모리 회계를 비운다 (앞 아이 값을 뒤 아이가 이어받지 않는다)')
  ok(/p_req: req/.test(dl) && /if \(!mem\.req\) \{ mem\.req = newReqToken\(\); writeLocal\(\) \}/.test(dl),
    '★★요청 토큰을 저장소에 두고 보낸다 (응답 유실 재시도·두 탭 중복 계상 차단)')
  ok(/const applied = Number\.isFinite/.test(dl) && /Math\.min\(snapshot, mem\.sent \+ applied\)/.test(dl),
    '★서버가 실제로 반영한 만큼만 sent 를 올린다 (500 절사분을 보낸 것으로 치지 않는다)')
  ok(/if \(serverDay === todayStr\(\)\)/.test(dl), '★서버가 말한 날짜가 오늘일 때만 오늘 값으로 쓴다 (자정 경계)')
  ok(/rpcFail = String\(e\)/.test(dl) && /export function ledgerRpcFailure/.test(dl),
    '★RPC 실패를 삼키지 않고 남긴다 (L47 — 조용한 실패 금지)')

  const rv = src('src/lib/review.ts')
  ok(!/localStorage\.setItem\(REVIEW_GRADED_KEY/.test(rv) && !/localStorage\.getItem\(REVIEW_GRADED_KEY/.test(rv),
    '★review.ts가 더 이상 자기만의 회계를 갖지 않는다 (규칙 복사 금지 — L27)')
  ok(/from '\.\/dailyLedger'/.test(rv), 'review.ts가 회계를 dailyLedger에서 가져온다')
  ok(/const graded = gradedToday\(\)/.test(rv), '★todaysMine의 분모가 그 회계다 (호출부 검사 — L59)')
  ok(/syncDailyLedger\(\)/.test(mine) && /setLedgerLearner\(lid\)/.test(mine), '★광산 입구에서 서버 권위값을 맞춘다')
  ok(/\[all, ledgerTick\]/.test(mine), '★서버 값이 도착하면 오늘 몫을 다시 계산한다 (안 하면 첫 화면이 낡은 채로 남는다)')
}

console.log('── ⑤ 실기기 자가진단 (L8) ──')
{
  const sc = src('src/lib/selfCheck.ts')
  ok(/if \(!learnerId \|\| !writesAllowed\(\)\) return/.test(sc), '★학습 기기에서만 보고한다 (아빠 PC 진단이 섞이지 않게)')
  ok(/rpc\('wc_device_check', \{ p_learner_id: learnerId, p_version: APP_VERSION, p_data: data \}\)/.test(sc), '★진단을 서버에 남긴다')
  ok(/localStorage\.getItem\(DONE_KEY\) === stamp/.test(sc), '★하루 1회·버전당 1회 (행이 무한히 늘지 않는다)')
  ok(/scheduleFollowup/.test(sc) && /FOLLOWUP_MS/.test(sc), '★90초 뒤 한 번 더 갱신한다 (그때는 실제 발화 결과가 있다)')
  ok(/getComputedStyle\(el\)\.fontSize/.test(sc), '★폰트 부스팅을 실제로 잰다 (지정값과 렌더값 대조)')
  ok(/'visibilitychange'/.test(sc), '★visibilitychange 발화 여부를 관측한다')

  const tts = src('src/lib/tts.ts')
  ok(/u\.onstart = \(\) => \{ lastOutcome = 'web_started' \}/.test(tts), '★웹 발화의 시작을 실제로 받는다')
  ok(/lastOutcome = 'web_silent'\s*\n\s*u\.onstart/.test(tts), "★onstart도 onerror도 안 오면 'web_silent'로 남는다 (가장 의심스러운 상태가 드러난다)")
  ok(/lastOutcome = 'native_started'/.test(tts) && /lastOutcome = 'native_failed'/.test(tts), '★네이티브 발화의 성패를 구분해 남긴다')
  ok(/export function speechReport\(/.test(tts), '계측 결과를 밖에서 읽을 수 있다')

  const app = src('src/App.tsx')
  ok(/void runSelfCheck\(s\.learnerId\)/.test(app), '★★App이 실제로 자가진단을 돌린다 (호출부 검사 — L59)')

  const css = readFileSync('public/css.d/42-v1446.css', 'utf8')
  ok(/-webkit-text-size-adjust: 100%/.test(css), '★폰트 부스팅 방어가 CSS에 실제로 걸려 있다')
}

console.log(fail === 0 ? '\n✅ device_check 통과' : `\n❌ device_check 실패 ${fail}건`)
process.exit(fail === 0 ? 0 : 1)
