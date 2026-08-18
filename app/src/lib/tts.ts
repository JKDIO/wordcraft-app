// 이중화 TTS (영구교훈 L8) — APK(안드로이드 WebView)는 speechSynthesis 보이스가 비어
// 조용히 실패하므로, 네이티브면 Capacitor TextToSpeech 플러그인, 브라우저면 Web Speech API.
//
// v1.4.14: 네이티브 ↔ 웹 이중 발화 차단. 네이티브 speak()의 프라미스는 "중단"으로도 거절될 수
// 있는데, 그때 무조건 웹 TTS로 폴백하면 네이티브 목소리 + 웹 목소리가 겹친다(남/여 동시).
// 발화 세대(speakGen)를 두고, 폴백은 "그 사이 새 발화·정지가 없었을 때"만 허용한다.
let voice: SpeechSynthesisVoice | null = null
/** 발화 세대 — speak()/stopSpeak() 때마다 오른다. 옛 세대의 폴백은 무효. */
let speakGen = 0

/* ═══ ★v1.4.46 — 발화 계측 (A24 WebView 미검증 항목을 '측정된 것'으로 바꾼다)★ ═══════
   L8이 남긴 미검증 항목 중 하나가 **"A24에서 네이티브 TTS가 실제로 발성하는가"** 였다.
   지금까지의 유일한 확인 방법은 "예한이 폰에서 소리가 나는지 봐 주세요"였다 — 사람 손을 빌리는 검증이다.

   여기서는 **실제 발화의 결과**를 기록한다. 시험용 가짜 발화를 쏘지 않는 이유가 두 가지 있다:
     ① 안드로이드 WebView는 사용자 제스처 전 발화를 막는 경우가 있어, 앱 시작 시 쏘면
        **실제로는 잘 되는 기기가 '실패'로 찍힌다**(거짓 음성). 잘못된 정답지는 없는 것보다 나쁘다.
     ② 아이가 듣는 중에 시험음이 끼어들면 그것 자체가 결함이다.

   ★정직한 한계★ 이 계측이 증명하는 것은 **"TTS 엔진이 발화 시작을 알렸다"** 까지다.
   스피커에서 실제로 소리가 났는지, 볼륨이 0은 아닌지는 기계가 알 수 없다. 그 칸은 여전히 사람 몫이다. */
export type SpeechOutcome =
  | 'none'            // 아직 한 번도 말한 적 없음
  | 'native_pending'  // 네이티브 플러그인이 발화를 받았고 아직 끝나지 않았다
  | 'native_started'  // 네이티브 플러그인이 발화를 받아 정상 종료(프라미스 resolve)
  | 'native_failed'   // 네이티브가 거절 → 웹으로 폴백
  | 'web_started'     // Web Speech API가 onstart를 냈다
  | 'web_error'       // Web Speech API가 onerror를 냈다
  | 'web_silent'      // speak()는 호출됐는데 onstart도 onerror도 안 왔다 (가장 의심스러운 상태)
  | 'unavailable'     // 이 기기에 TTS 경로가 아예 없다

let lastOutcome: SpeechOutcome = 'none'
let attempts = 0
let nativeUsed = false

export function speechReport(): { outcome: SpeechOutcome; attempts: number; native: boolean; voices: number } {
  let voices = 0
  try { voices = window.speechSynthesis?.getVoices()?.length ?? 0 } catch { /* */ }
  return { outcome: lastOutcome, attempts, native: nativeUsed, voices }
}

function pickVoice() {
  const vs = window.speechSynthesis?.getVoices() ?? []
  voice =
    vs.find(v => v.lang === 'en-US' && /Google/i.test(v.name)) ||
    vs.find(v => v.lang === 'en-US') ||
    vs.find(v => v.lang.startsWith('en')) ||
    null
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoice()
  window.speechSynthesis.onvoiceschanged = pickVoice
}

// Capacitor 네이티브 TTS — 런타임 주입 window.Capacitor 글로벌로 직접 호출 (번들 의존성 0)
interface NativeTts { speak(opts: Record<string, unknown>): Promise<void> | void; stop?: () => void }
let nativePlugin: NativeTts | null = null
let nativeChecked = false

function nativeTts(): NativeTts | null {
  if (nativeChecked) return nativePlugin
  nativeChecked = true
  try {
    const Cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; isNative?: boolean; Plugins?: Record<string, NativeTts>; registerPlugin?: (n: string) => NativeTts } }).Capacitor
    if (!Cap || !(Cap.isNativePlatform?.() ?? Cap.isNative)) return (nativePlugin = null)
    nativePlugin = Cap.Plugins?.TextToSpeech || (Cap.registerPlugin ? Cap.registerPlugin('TextToSpeech') : null)
  } catch { nativePlugin = null }
  return nativePlugin
}

function speakWeb(text: string, rate: number, my?: number) {
  try {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    if (my !== undefined && my !== speakGen) return // 세대 지남 = 이미 다른 소리로 넘어감
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    if (voice) u.voice = voice
    u.rate = rate
    // ★v1.4.46★ 결과를 남긴다. onstart/onerror가 둘 다 안 오면 'web_silent'로 남아
    //   "말하라고 했는데 아무 일도 안 일어났다"는 상태가 보고서에 드러난다.
    lastOutcome = 'web_silent'
    u.onstart = () => { lastOutcome = 'web_started' }
    u.onerror = () => { lastOutcome = 'web_error' }
    synth.speak(u)
  } catch { /* TTS 불가 기기 — 소리 없이도 학습 가능하게 설계됨 */ }
}

export function speak(text: string, rate = 0.85) {
  const my = ++speakGen
  attempts++
  const n = nativeTts()
  if (n && typeof n.speak === 'function') {
    nativeUsed = true
    try {
      try { n.stop?.() } catch { /* */ }
      try { window.speechSynthesis?.cancel() } catch { /* */ } // 웹 잔여 발화 제거(네이티브와 겹침 방지)
      const p = n.speak({ text, lang: 'en-US', rate, pitch: 1, volume: 1, category: 'ambient' })
      lastOutcome = 'native_pending' // 아직 모른다 — 아래 프라미스가 확정한다
      if (p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>).then(
          () => { lastOutcome = 'native_started' },
          () => { lastOutcome = 'native_failed'; if (my === speakGen) speakWeb(text, rate, my) },
        )
      } else {
        // 프라미스를 안 돌려주는 구현 — 예외 없이 받았다는 것까지가 우리가 아는 전부다.
        lastOutcome = 'native_started'
      }
      return
    } catch { lastOutcome = 'native_failed' /* 네이티브 실패 → 웹 폴백 */ }
  }
  if (!ttsAvailable()) { lastOutcome = 'unavailable'; return }
  speakWeb(text, rate, my)
}

export function stopSpeak() {
  speakGen++ // 예약된 폴백 전부 무효화
  try { nativeTts()?.stop?.() } catch { /* */ }
  try { window.speechSynthesis?.cancel() } catch { /* */ }
}

export function ttsAvailable(): boolean {
  if (typeof window === 'undefined') return false
  if (nativeTts()) return true
  return 'speechSynthesis' in window
}
