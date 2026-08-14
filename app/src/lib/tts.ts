// 이중화 TTS (영구교훈 L8) — APK(안드로이드 WebView)는 speechSynthesis 보이스가 비어
// 조용히 실패하므로, 네이티브면 Capacitor TextToSpeech 플러그인, 브라우저면 Web Speech API.
//
// v1.4.14: 네이티브 ↔ 웹 이중 발화 차단. 네이티브 speak()의 프라미스는 "중단"으로도 거절될 수
// 있는데, 그때 무조건 웹 TTS로 폴백하면 네이티브 목소리 + 웹 목소리가 겹친다(남/여 동시).
// 발화 세대(speakGen)를 두고, 폴백은 "그 사이 새 발화·정지가 없었을 때"만 허용한다.
let voice: SpeechSynthesisVoice | null = null
/** 발화 세대 — speak()/stopSpeak() 때마다 오른다. 옛 세대의 폴백은 무효. */
let speakGen = 0

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
    synth.speak(u)
  } catch { /* TTS 불가 기기 — 소리 없이도 학습 가능하게 설계됨 */ }
}

export function speak(text: string, rate = 0.85) {
  const my = ++speakGen
  const n = nativeTts()
  if (n && typeof n.speak === 'function') {
    try {
      try { n.stop?.() } catch { /* */ }
      try { window.speechSynthesis?.cancel() } catch { /* */ } // 웹 잔여 발화 제거(네이티브와 겹침 방지)
      const p = n.speak({ text, lang: 'en-US', rate, pitch: 1, volume: 1, category: 'ambient' })
      if (p && typeof (p as Promise<void>).catch === 'function') {
        (p as Promise<void>).catch(() => { if (my === speakGen) speakWeb(text, rate, my) })
      }
      return
    } catch { /* 네이티브 실패 → 웹 폴백 */ }
  }
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
