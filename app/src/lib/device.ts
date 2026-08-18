/** 기기 역할 — "이 기기에서 한 것을 아이 기록으로 쓸 것인가" 단일 원천 (v1.4.46 신설 · C5 봉합)
 *
 * ═══ 왜 이 파일이 생겼나 — C5 ═══════════════════════════════════════════════
 * 이 앱은 학습자 화면 `#/`를 여는 것만으로 `sessions` INSERT를 냈다. 아빠 PC에는 예한이의
 * `learnerId`가 localStorage에 남아 있으므로, **아빠가 화면을 확인하려고 열 때마다 아이 계정에 썼다.**
 *
 * 실측(2026-08-18 DB 전수):
 *   · `sessions` 중 `device='desktop'` = **75건**, 그중 최근 30건은 **문항 0개**.
 *   · 그 75건 전부가 예한이 한 명의 것이다(다른 두 아이는 desktop 세션이 0건).
 *   · 세션 244는 `duration_seconds` **37,027초(10시간 17분)** — 아빠 PC에 탭이 열린 채 밤을 샌 것이다.
 *   · 반대로 `device='mobile'`은 152세션 · 문항 5,787개 — **실제 학습은 100% 모바일에서 일어났다.**
 *
 * ═══ 그래서 어떻게 고쳤나 ══════════════════════════════════════════════════
 * "이 기기 누구 거야?"를 **모두에게** 묻는 설계는 쓰지 않았다. 지금 이 앱은 예한이만 쓰는 게 아니다
 * (호영·찬영이 매일 쓰고 있다). 아이 셋에게 새 질문 화면을 강제로 띄우는 것은,
 * **실제 오염이 한 번도 없었던 경로에 마찰을 다는 것**이라 비례하지 않는다.
 *
 * 대신 데이터가 가리키는 그대로 판정한다:
 *   · **모바일 = 학습 기기** (지금까지와 100% 동일하게 동작. 아이들은 아무 변화를 못 느낀다)
 *   · **데스크탑 = 구경 모드**(읽기 전용). 화면 위에 띠가 뜨고, **한 번 누르면** 학습 기기로 바꿀 수 있다.
 *     조용히 막지 않는다 — 막힌 사실과 푸는 방법을 항상 화면에 적는다(L47).
 *   · 한 번 고르면 이 기기에 기억한다. 다시 묻지 않는다.
 *   · 보호자(구글 로그인) 기기는 어떤 경우에도 학습자 쓰기를 하지 않는다.
 *
 * ═══ 규칙 ════════════════════════════════════════════════════════════════
 * 학습자 앱의 서버 쓰기는 **예외 없이** `writesAllowed()`를 통과해야 한다.
 * 실제 관문은 `store.ts`의 `enqueue()`와 `startSession()` 두 곳이다(관제실 쓰기는 여기 해당 없음).
 * 새 쓰기 경로를 만들 때 이 파일을 우회하면 `device_check.mjs`가 실패한다(L27 — 검사는 기억이 아니라 스크립트로).
 */
import { authKind } from './supabase'

export type DeviceRole = 'learner' | 'observer'

/** 이 기기의 역할(사람이 고른 값). 없으면 null — 그때는 UA로 추정한다. */
export const DEVICE_ROLE_KEY = 'wordcraft_device_role_v1'
/** 막힌 쓰기 흔적 — 조용한 차단 금지(L47). 화면·정보탭이 이 값을 읽어 사실대로 말한다. */
export const BLOCKED_WRITES_KEY = 'wordcraft_blocked_writes_v1'

/** localStorage가 죽어 있어도(사생활 모드·쿼터 초과) 역할 판정이 흔들리지 않게 메모리에도 둔다. */
let memRole: DeviceRole | null = null
let memBlocked = 0

export function isMobileUA(): boolean {
  try {
    const ua = navigator.userAgent || ''
    // Capacitor WebView(예한이 APK)도 안드로이드 UA라 Mobile을 포함한다.
    return /Mobile|Android|iPhone|iPad|iPod/i.test(ua)
  } catch { return false }
}

/** 사람이 명시적으로 고른 값만 돌려준다(추정 없음). 화면이 "물어봐야 하나"를 판단할 때 쓴다. */
export function chosenDeviceRole(): DeviceRole | null {
  if (memRole) return memRole
  try {
    const v = localStorage.getItem(DEVICE_ROLE_KEY)
    if (v === 'learner' || v === 'observer') { memRole = v; return v }
  } catch { /* 저장소 불가 — 메모리 값만 */ }
  return null
}

/** 이 기기의 역할. 고른 값이 있으면 그것, 없으면 UA 추정(모바일=학습 / 데스크탑=구경). */
export function deviceRole(): DeviceRole {
  return chosenDeviceRole() ?? (isMobileUA() ? 'learner' : 'observer')
}

export function setDeviceRole(r: DeviceRole): void {
  memRole = r
  try { localStorage.setItem(DEVICE_ROLE_KEY, r) } catch { /* 메모리에는 남는다 */ }
  if (r === 'learner') clearBlockedWrites()
}

/** ★학습자 앱의 서버 쓰기 관문★ — 이 함수가 false면 단 한 바이트도 나가지 않는다. */
export function writesAllowed(): boolean {
  if (authKind() === 'guardian') return false   // 보호자 기기는 아이 기록을 만들지 않는다
  return deviceRole() === 'learner'
}

/** 구경 모드 때문에 막힌 쓰기 횟수 — 화면이 "여기서 한 건 기록에 안 남았어"라고 말할 근거. */
export function blockedWrites(): number {
  try {
    const n = Number(localStorage.getItem(BLOCKED_WRITES_KEY) || '0')
    return Number.isFinite(n) ? Math.max(n, memBlocked) : memBlocked
  } catch { return memBlocked }
}

export function noteBlockedWrite(): void {
  memBlocked = blockedWrites() + 1
  try { localStorage.setItem(BLOCKED_WRITES_KEY, String(memBlocked)) } catch { /* */ }
}

export function clearBlockedWrites(): void {
  memBlocked = 0
  try { localStorage.removeItem(BLOCKED_WRITES_KEY) } catch { /* */ }
}
