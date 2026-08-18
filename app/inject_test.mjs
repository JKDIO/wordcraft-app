/** inject_test.mjs — 결함 주입 메타 검증 (v1.4.46 신설)
 *
 * ★왜 이 파일이 있나 — L27④ · L59③★
 *   "검사 N개 신설 · 전부 통과"는 **아무것도 증명하지 않는다.** 그 검사가 결함을 만났을 때
 *   실제로 우는지 확인하기 전까지는 검사가 아니다. v1.4.45에서 신규 검사 10개에 결함을 주입했더니
 *   **2개가 침묵했다**(정규식이 함수 정의에도 걸림 · 파일 경로 오타). 주입을 안 했다면
 *   "25항목 신설 · 전부 통과"라고 보고했을 것이다.
 *
 * ★규칙(L59④)★ 주입 대상은 **"이 검사가 막으려는 바로 그 결함"** 이어야 한다.
 *   비슷한 것을 주입해 통과시키면 의미가 없다. 아래 목록은 각 검사의 존재 이유를 그대로 되돌린다.
 *
 * 사용: node inject_test.mjs        (하나라도 침묵하면 exit 1)
 */
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync, unlinkSync } from 'node:fs'

const CASES = [
  // ── C1 객관식 셔플 ────────────────────────────────────────────────
  { id: 'C1-1', check: 'shuffle_check.mjs', file: 'src/engine/QuestionCard.tsx',
    why: '섞지 않고 원래 순서로 그린다 (v1.4.45까지의 상태 그대로)',
    from: '{order.map((src, i) => {', to: '{item.choices.map((src2, i) => { const src = i;' },
  { id: 'C1-2', check: 'shuffle_check.mjs', file: 'src/engine/QuestionCard.tsx',
    why: '화면 자리를 그대로 내보낸다 (answer_events.given_answer 오염)',
    from: 'givenIdx: order[i]', to: 'givenIdx: i' },
  { id: 'C1-3', check: 'shuffle_check.mjs', file: 'src/engine/QuestionCard.tsx',
    why: '순열 deps를 비운다 (첫 문항 순열이 끝까지 남는다)',
    from: '[item.id, item.choices.length],', to: '[],' },
  { id: 'C1-4', check: 'shuffle_check.mjs', file: 'src/lib/shuffle.ts',
    why: '셔플을 항등으로 만든다 (편향이 그대로 화면에 남는다)',
    from: '  let st = fmix32(seed ^ 0x9e3779b9)', to: '  let st = fmix32(seed ^ 0x9e3779b9); if (n >= 0) return a' },
  /* ★주입 재조준★ 처음에는 `Math.floor(...)` 를 `(st & 0xff) % (i+1)` 로 바꿔 넣었는데 **검사가 침묵했다.**
     당연했다 — `st`가 이미 fmix32를 통과한 값이라 하위 바이트도 잘 섞여 있다. 즉 그건 결함이 아니다.
     검사가 진짜로 막는 것은 **비트를 섞지 않은 선형 상태의 하위 비트를 그대로 쓰는 것**이다
     (`gradeSwapped`가 `% 2`·`& 1`로 두 번 틀렸던 그 형태). 그것을 주입해야 의미가 있다 — L59④. */
  { id: 'C1-5', check: 'shuffle_check.mjs', file: 'src/lib/shuffle.ts',
    why: '비트를 안 섞은 선형 상태의 하위 비트를 쓴다 (gradeSwapped가 두 번 틀렸던 형태 — 규칙적 교대)',
    from: '    st = fmix32(st + 0x6d2b79f5)\n    const j = Math.floor((st / 4294967296) * (i + 1))',
    to: '    st = (st + 0x6d2b79f5) >>> 0\n    const j = st % (i + 1)' },

  // ── C5 기기 게이트 ────────────────────────────────────────────────
  { id: 'C5-1', check: 'device_check.mjs', file: 'src/lib/store.ts',
    why: 'enqueue의 관문을 없앤다 (아빠 PC에서 다시 아이 기록에 쓴다)',
    from: '  if (!writesAllowed()) { noteBlockedWrite(); return }\n', to: '' },
  { id: 'C5-2', check: 'device_check.mjs', file: 'src/lib/store.ts',
    why: 'sessions INSERT의 관문을 없앤다 (C5의 실제 오염 한 줄)',
    from: '  if (writesAllowed()) {', to: '  if (true) {' },
  { id: 'C5-3', check: 'device_check.mjs', file: 'src/lib/device.ts',
    why: '데스크탑도 기본을 학습 기기로 (오염 경로 복구)',
    from: "return chosenDeviceRole() ?? (isMobileUA() ? 'learner' : 'observer')", to: "return chosenDeviceRole() ?? 'learner'" },
  { id: 'C5-4', check: 'device_check.mjs', file: 'src/lib/device.ts',
    why: '보호자 기기도 아이 기록을 쓰게 한다',
    from: "  if (authKind() === 'guardian') return false", to: '  /* removed */' },
  { id: 'C5-5', check: 'device_check.mjs', file: 'src/App.tsx',
    why: '구경 모드 띠를 안 그린다 (조용한 차단 — L47 위반)',
    from: '        {showObserverBar && (', to: '        {false && (' },

  // ── L61 서버 일일 회계 ────────────────────────────────────────────
  { id: 'L61-1', check: 'device_check.mjs', file: 'src/lib/dailyLedger.ts',
    why: '분모를 로컬만 본다 (저장 실패 시 상한이 매번 리셋되던 상태로 복귀)',
    from: '  return Math.max(l.n, serverMem.n)', to: '  return l.n' },
  { id: 'L61-2', check: 'device_check.mjs', file: 'src/lib/dailyLedger.ts',
    why: '저장 실패를 다시 삼킨다 (조용한 실패 — L47 위반)',
    from: '    storageFailed = true', to: '    storageFailed = false' },
  { id: 'L61-3', check: 'device_check.mjs', file: 'src/lib/dailyLedger.ts',
    why: '구경 모드에서도 서버 상한을 소모한다',
    from: '  if (!learnerId || !writesAllowed()) return Promise.resolve()', to: '  if (!learnerId) return Promise.resolve()' },
  { id: 'L61-4', check: 'device_check.mjs', file: 'src/screens/ReviewMine.tsx',
    why: '광산 입구에서 서버 권위값을 안 맞춘다',
    from: '    void syncDailyLedger().then(() => setLedgerTick(t => t + 1))', to: '' },
  { id: 'L61-5', check: 'device_check.mjs', file: 'src/screens/ReviewMine.tsx',
    why: '저장 실패 안내를 화면에서 지운다 (소비자 검사 — L51)',
    from: '        {storageBroken() && (', to: '        {false && (' },

  // ── L8 실기기 자가진단 ────────────────────────────────────────────
  { id: 'L8-1', check: 'device_check.mjs', file: 'src/App.tsx',
    why: '자가진단을 안 돌린다 (미검증 상태로 복귀)',
    from: '      void runSelfCheck(s.learnerId)', to: '' },
  { id: 'L8-2', check: 'device_check.mjs', file: 'src/lib/selfCheck.ts',
    why: '구경 모드(아빠 PC) 진단까지 아이 기록에 섞는다',
    from: '  if (!learnerId || !writesAllowed()) return', to: '  if (!learnerId) return' },
  { id: 'L8-3', check: 'device_check.mjs', file: 'src/lib/tts.ts',
    why: '발화 시작을 안 받는다 (소리가 났는지 영원히 모름)',
    from: "    u.onstart = () => { lastOutcome = 'web_started' }", to: '' },
  { id: 'L8-4', check: 'device_check.mjs', file: 'public/css.d/42-v1446.css',
    why: '폰트 부스팅 방어를 뺀다',
    from: '  -webkit-text-size-adjust: 100%;', to: '' },

  // ── 복원한 콘텐츠 검사 5종 ────────────────────────────────────────
  { id: 'R-measure20', check: 'measure20.mjs', file: 'src/lib/vocab.ts',
    why: '어휘 문항 보기를 안 섞는다 — 정답이 항상 1번이 된다 (L24가 막으려는 바로 그것)',
    from: 'function shuffle<T>(arr: T[], seed: number): T[] {\n  const a = arr.slice()',
    to: 'function shuffle<T>(arr: T[], seed: number): T[] {\n  const a = arr.slice()\n  if (a.length === 4) return a' },
  { id: 'R-golem', check: 'golem_check.mjs', file: 'src/lib/vocab.ts',
    why: '보스전(골렘)에 말하기 문항을 섞는다 (옛 결함)',
    from: "export function buildGolemSession(packs: VocabPack[], cleared: number, seed: number): VocabQuestion[] {",
    to: "export function buildGolemSession(packs: VocabPack[], cleared: number, seed: number): VocabQuestion[] {\n  if (seed === 101) return [{ id: 'golem:x', mode: 'speak', word: packs[0].words[0], prompt: 'x', promptKo: 'x', options: [], answer: 'x' } as unknown as VocabQuestion]" },
  { id: 'R-summon', check: 'summon_check.mjs', file: 'public/content.json', json: true,
    why: 'scene의 배역을 문장과 다르게 바꾼다 (v1.4.2 사고 — 화면이 거짓말을 한다)' },
  { id: 'R-w710', check: 'w710_check.mjs', file: 'public/content.json', json: true, w710: true,
    why: '확장 월드의 world 번호를 틀리게 한다 (C2 계열 — 관제실이 잘못된 진도를 말한다)' },
]

let silent = []
let cried = 0

for (const c of CASES) {
  const bak = `${c.file}.__bak`
  copyFileSync(c.file, bak)
  try {
    if (c.json) {
      const d = JSON.parse(readFileSync(c.file, 'utf8'))
      if (c.w710) {
        d.modules.P1.world = 7     // 옛 번호로 되돌린다 (v1.4.42 재정렬 이전 상태)
      } else {
        // scene 이 붙은 첫 문항의 배역을 문장과 어긋나게 바꾼다
        let done = false
        const walk = (o) => {
          if (done) return
          if (Array.isArray(o)) { for (const v of o) walk(v); return }
          if (o && typeof o === 'object') {
            if (o.scene && o.scene.actor) { o.scene.actor = o.scene.actor === 'cat' ? 'dog' : 'cat'; done = true; return }
            for (const v of Object.values(o)) walk(v)
          }
        }
        walk(d.modules)
        if (!done) throw new Error('scene 문항을 못 찾음 — 주입 자체가 실패')
      }
      writeFileSync(c.file, JSON.stringify(d))
    } else {
      let s = readFileSync(c.file, 'utf8')
      if (!s.includes(c.from)) throw new Error(`주입 지점을 못 찾음: ${c.from.slice(0, 60)}`)
      s = s.replace(c.from, c.to)
      if (c.extra) {
        if (!s.includes(c.extra.from)) throw new Error('보조 주입 지점을 못 찾음')
        s = s.replace(c.extra.from, c.extra.to)
      }
      writeFileSync(c.file, s)
    }

    let failed = false
    try { execSync(`node ${c.check}`, { stdio: 'pipe' }) } catch { failed = true }
    if (failed) { console.log(`  ✓ [${c.id}] ${c.check} 가 운다 — ${c.why}`); cried++ }
    else { console.log(`  ✗ [${c.id}] ★${c.check} 가 침묵했다★ — ${c.why}`); silent.push(c.id) }
  } catch (e) {
    console.log(`  ! [${c.id}] 주입 실패: ${e.message}`)
    silent.push(`${c.id}(주입실패)`)
  } finally {
    copyFileSync(bak, c.file)
    unlinkSync(bak)
  }
}

console.log(`\n결함 주입 ${CASES.length}건 — 검사가 운 것 ${cried}건 · 침묵 ${silent.length}건`)
if (silent.length) { console.log('★침묵한 항목:', silent.join(', ')); process.exit(1) }
console.log('✅ 모든 신규·복원 검사가 자기가 막으려는 결함에 반응한다')
