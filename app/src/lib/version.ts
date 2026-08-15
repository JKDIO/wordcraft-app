// 앱 버전 + 원격 업데이트 체크 — 서버 /version.json과 비교
// 배포 시 반드시 APP_VERSION과 dist/version.json의 version을 함께 올릴 것 (RELEASE_LOG 규칙)
export const APP_VERSION = '1.4.39'

export interface VersionInfo {
  version: string; date?: string; notes?: string
  /** v1.4.16 — 단어 대륙 입구 스위치. 음원 전수 파형 감사(L22) PASS 후 서버에서 true로 바꾸면
   *  앱 재배포 없이 예한이에게 입구가 열린다. 미설정(undefined)이면 닫힘으로 본다. */
  vocab_ready?: boolean
  /** v1.4.23 — 월드 7~10 입구 스위치. 콘텐츠·코드는 배포돼 있지만 이 값이 true가 되기 전까지
   *  월드맵에 **그려지지도 않고** 진행률·잠금 계산에도 들어가지 않는다.
   *  Dio님 승인 + 음원 파형 감사(L22) PASS 후에 서버에서 켠다 — 앱 재배포 불필요. */
  worlds_ready?: boolean
}

/** a가 b보다 최신이면 true (semver 단순 비교) */
export function isNewer(a: string, b: string): boolean {
  const A = String(a).split('.').map(x => parseInt(x, 10) || 0)
  const B = String(b).split('.').map(x => parseInt(x, 10) || 0)
  const len = Math.max(A.length, B.length)
  for (let i = 0; i < len; i++) {
    const x = A[i] || 0, y = B[i] || 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}
