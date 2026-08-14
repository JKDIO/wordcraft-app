// v1.3.0 오디오 재생 (CONTRACT v1.3 §9) — Storage public URL 클립 우선, 실패/부재 시 네이티브 TTS 폴백.
// WebView 안전(L8): 표준 HTMLAudioElement + 기존 tts.ts 폴백만 사용, 브라우저 전용 API 의존 없음.
// v1.4.1: 이중 재생(남/여 동시) 1차 봉합 — 정지 시 핸들러 먼저 해제 + 시작된 클립은 늦은 error여도 폴백 금지(started).
//
// ★v1.4.14 — 단일 오디오 채널(single audio channel)★ (L19 확장)
// 앱에서 나는 모든 소리는 반드시 이 모듈 하나를 통과한다. 동시에 두 소리가 나는 것을
// "고치는" 게 아니라 "구조적으로 불가능"하게 만드는 것이 이 파일의 계약이다.
//   ① 세대(generation) 토큰 — 재생·정지가 일어날 때마다 gen이 오른다. 옛 세대가 예약한
//      콜백(늦은 error, play() 프라미스 거절, 폴백)은 전부 무효화된다.
//      ※ v1.4.1이 못 막은 실제 경로: stopClip()의 pause()가 이전 클립의 play() 프라미스를
//        AbortError로 거절시키고 → 그 거절이 "이전 문항의 TTS 폴백"을 깨워 새 클립과 겹쳤다.
//        (핸들러 해제(onerror=null)로는 프라미스 거절을 막을 수 없다.)
//   ② 모든 재생 진입점은 먼저 stopClip() — 클립이든 TTS든 예외 없다.
//      ※ v1.4.13까지 audio_url이 없는 TTS 항목은 이전 클립을 끄지 않고 겹쳐 울렸다.
//   ③ 화면 이탈·백그라운드 전환 시 전역 정지(hashchange·visibilitychange·pagehide).
// 규칙: 컴포넌트는 tts.ts의 speak()를 직접 import하지 않는다. playClip() 또는 speakText()만 쓴다.
import { speak, stopSpeak } from './tts'

const AUDIO_BASE = 'https://gbynvzxgbpmoqdsriowz.supabase.co/storage/v1/object/public/tts-audio/'

let current: HTMLAudioElement | null = null
/** 재생 세대 — 이 값이 바뀌면 그 이전에 예약된 모든 오디오 콜백은 무효다. */
let gen = 0

export interface Playable { audio_url?: string | null; tts?: string | null }

function detach(a: HTMLAudioElement) {
  a.onplaying = null
  a.onerror = null
  a.onended = null
  a.onpause = null
}

/**
 * 앱의 모든 소리를 즉시 끈다(재생 중 클립 + 네이티브/웹 TTS + 예약된 폴백).
 * 세대를 올리므로 이 호출 이후에는 옛 콜백이 되살아나 소리를 낼 수 없다.
 */
export function stopClip() {
  gen++
  const a = current
  current = null
  try {
    if (a) {
      detach(a)
      a.pause()
      a.src = ''
    }
  } catch { /* */ }
  stopSpeak()
}

/** stopClip의 의미를 명확히 한 별칭 — "클립만"이 아니라 앱의 모든 소리를 끈다. */
export const stopAudio = stopClip

/** 클립 재생 — rate 0.75 = 천천히 토글. 클립 실패 시 tts 텍스트로 1회 폴백. */
export function playClip(p: Playable, rate = 1) {
  stopClip()            // ② 어떤 경로로 들어와도 이전 소리를 먼저 끊는다
  const my = gen        // ① 이번 재생의 세대
  const ttsRate = rate < 1 ? 0.6 : 0.85
  if (p.audio_url) {
    try {
      const a = new Audio(p.audio_url)
      a.playbackRate = rate
      let started = false
      let fell = false
      const fallback = () => {
        if (my !== gen) return   // 세대가 지났다 = 이미 다른 소리로 넘어갔다 → 절대 폴백 금지
        if (started || fell) return
        fell = true
        if (p.tts) speak(p.tts, ttsRate)
      }
      a.onplaying = () => { started = true }
      a.onerror = fallback
      current = a
      const pr = a.play()
      if (pr && typeof pr.catch === 'function') pr.catch(fallback)
      return
    } catch { /* 아래 폴백 */ }
  }
  if (p.tts && my === gen) speak(p.tts, ttsRate)
}

/**
 * 클립이 없는 텍스트 전용 재생(복습 광산 플래시카드 등).
 * 컴포넌트가 tts.ts의 speak()를 직접 부르면 단일 채널을 우회해 겹침이 생기므로 이 함수를 쓴다.
 */
export function speakText(text: string, rate = 0.85) {
  if (!text) return
  stopClip()
  speak(text, rate)
}

/** 콘텐츠 빌드 시 주입되는 audio_url 규약과 동일한 URL 생성 (수동 참조용) */
export function clipUrl(scope: string, slug: string, voice: string): string {
  return `${AUDIO_BASE}${scope}/${slug}_${voice}.mp3`
}

// ③ 전역 안전망 — 화면 이탈·백그라운드에서 소리가 살아남아 다음 화면 소리와 겹치지 않게.
//    (L8: WebView에서 pagehide는 거의 안 뜬다 → visibilitychange를 주력으로, pagehide는 보조)
if (typeof window !== 'undefined') {
  try {
    window.addEventListener('hashchange', () => stopClip())
    window.addEventListener('pagehide', () => stopClip())
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => { if (document.hidden) stopClip() })
    }
  } catch { /* */ }
}
