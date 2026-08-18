/** 실기기 자가진단 — A24 WebView 고유 동작을 **앱이 스스로 재서 남긴다** (v1.4.46 신설)
 *
 * ═══ 왜 만들었나 ═══════════════════════════════════════════════════════
 * L8이 남긴 미검증 3종 — ① 네이티브 TTS 실제 발성 ② 폰트 부스팅 ③ `visibilitychange` —
 * 은 **격리 렌더(Chromium)로는 증명할 수 없다.** 그래서 매 릴리스마다 마지막 보고서에
 * "예한이 폰에서 30초만 봐 주세요"가 붙었고, 그 칸은 **여덟 릴리스 동안 비어 있었다.**
 *
 * 사람 눈에 의존하는 검증은 사실상 검증되지 않는다. 그래서 관측을 앱 안으로 옮겼다:
 * 아이가 앱을 여는 순간(하루 1회) 이 기기의 실제 동작을 재서 `device_checks`에 한 줄 남긴다.
 * 다음부터는 아무에게도 묻지 않고 **DB를 조회하면 답이 나온다.**
 *
 * ═══ 무엇을 재는가 ════════════════════════════════════════════════════
 * | 키 | 재는 것 | 무엇을 증명하나 |
 * |---|---|---|
 * | `native` | Capacitor TextToSpeech 플러그인 존재 | APK 경로인지 브라우저 경로인지 |
 * | `voices` | `speechSynthesis.getVoices().length` | L8이 말한 "보이스가 비어 조용히 실패" 여부 |
 * | `speech` | **실제 발화**의 결과(tts.ts 계측) | 발화 시작 신호가 왔는가 |
 * | `boost` | 지정 12px 대비 실제 렌더 px | 안드로이드 폰트 부스팅 발생 여부 |
 * | `vis` | `visibilitychange`가 이 세션에서 실제로 발화했는가 | 세션 시간 계산의 전제 |
 * | `ua` `dpr` `vw` `vh` `tz` | 기기 정체 | A24인지, 어떤 뷰포트인지 |
 *
 * ═══ ★정직한 한계 — 이 파일이 못 하는 것★ ══════════════════════════════
 * **스피커에서 실제로 소리가 났는지는 끝까지 알 수 없다.** 볼륨 0, 무음 모드, 블루투스 연결,
 * 이어폰 미착용은 어떤 브라우저 API로도 관측되지 않는다. 이 진단이 올려 주는 것은
 * "모름" → "엔진이 발화 시작을 알렸음"까지다. 마지막 한 칸은 여전히 사람(예한이)의 귀다.
 * 그 칸을 여기서 채운 척하지 않는다.
 *
 * ═══ 쓰기 규칙 ══════════════════════════════════════════════════════
 * · 학습 기기(C5 게이트 통과)에서만 보낸다 — 아빠 PC의 진단이 아이 기록에 섞이면 의미가 없다.
 * · 하루 1회 · 버전당 1회. 같은 날 다시 열면 **같은 행을 갱신**한다(행이 늘지 않는다).
 * · 학습 데이터가 아니므로 실패해도 아무것도 막지 않는다.
 */
import { rpc } from './supabase'
import { todayStr } from './leitner'
import { APP_VERSION } from './version'
import { writesAllowed, deviceRole } from './device'
import { speechReport, ttsAvailable } from './tts'
import { storageBroken } from './dailyLedger'

const DONE_KEY = 'wordcraft_selfcheck_v1'
/** 첫 보고 뒤 이만큼 지나서 한 번 더 갱신한다 — 그때쥱이면 아이가 소리를 한 번은 들었다. */
const FOLLOWUP_MS = 90_000

let visibilityFired = false
if (typeof document !== 'undefined') {
  try { document.addEventListener('visibilitychange', () => { visibilityFired = true }, { passive: true }) } catch { /* */ }
}

/**
 * 안드로이드 WebView '폰트 부스팅' 계측.
 * 부스팅은 **긴 텍스트 블록**에 걸리므로 짧은 글자로는 안 잡힌다 — 그래서 긴 문장을 넣는다.
 * 반환: { spec: 지정 px, real: 실제 렌더 px, boosted: 5% 이상 커졌는가 }
 */
export function measureFontBoost(): { spec: number; real: number; boosted: boolean } {
  const fail = { spec: 12, real: 12, boosted: false }
  if (typeof document === 'undefined' || !document.body) return fail
  let el: HTMLDivElement | null = null
  try {
    el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = 'position:absolute;left:-9999px;top:0;width:320px;font-size:12px;line-height:1.4;'
    el.textContent = 'The quick brown fox jumps over the lazy dog. '.repeat(8)
    document.body.appendChild(el)
    const real = parseFloat(getComputedStyle(el).fontSize) || 12
    return { spec: 12, real, boosted: real > 12.6 }
  } catch {
    return fail
  } finally {
    try { if (el && el.parentNode) el.parentNode.removeChild(el) } catch { /* */ }
  }
}

/** 지금 시점에 알 수 있는 것 전부를 모은다. */
export function collectSelfCheck(): Record<string, unknown> {
  const sp = speechReport()
  const fb = measureFontBoost()
  let ua = '', dpr = 0, vw = 0, vh = 0, tz = ''
  try { ua = (navigator.userAgent || '').slice(0, 300) } catch { /* */ }
  try { dpr = window.devicePixelRatio || 0 } catch { /* */ }
  try { vw = window.innerWidth; vh = window.innerHeight } catch { /* */ }
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* */ }
  return {
    v: APP_VERSION,
    role: deviceRole(),
    ua, dpr, vw, vh, tz,
    native: sp.native,
    tts_available: ttsAvailable(),
    voices: sp.voices,
    speech: sp.outcome,
    speech_attempts: sp.attempts,
    boost_spec: fb.spec,
    boost_real: Math.round(fb.real * 100) / 100,
    boosted: fb.boosted,
    vis_supported: typeof document !== 'undefined' && 'hidden' in document,
    vis_fired: visibilityFired,
    storage_broken: storageBroken(),
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  }
}

async function send(learnerId: string, data: Record<string, unknown>): Promise<void> {
  try {
    await rpc('wc_device_check', { p_learner_id: learnerId, p_version: APP_VERSION, p_data: data })
  } catch { /* 진단 보고는 실패해도 학습을 막지 않는다 */ }
}

/**
 * 하루 1회 자가진단. 즉시 한 번 보내고, 90초 뒤 **실제 발화·화면 전환 결과를 반영해** 한 번 더 갱신한다.
 * (같은 (아이, 날짜, 버전) 행을 덮어쓰므로 행이 늘지 않는다.)
 */
export async function runSelfCheck(learnerId: string | null): Promise<void> {
  if (!learnerId || !writesAllowed()) return
  const stamp = `${learnerId}|${todayStr()}|${APP_VERSION}`
  try { if (localStorage.getItem(DONE_KEY) === stamp) { scheduleFollowup(learnerId); return } } catch { /* */ }
  try { localStorage.setItem(DONE_KEY, stamp) } catch { /* 저장 못 해도 보내는 건 문제없다 */ }
  await send(learnerId, collectSelfCheck())
  scheduleFollowup(learnerId)
}

let followupTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFollowup(learnerId: string): void {
  if (followupTimer) return
  followupTimer = setTimeout(() => { void send(learnerId, collectSelfCheck()) }, FOLLOWUP_MS)
}
