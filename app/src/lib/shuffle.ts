/** 객관식 선택지 섞기 — 정답 위치가 정보를 흘리지 않게 (v1.4.46 신설 · C1 봉합)
 *
 * ═══ 왜 이 파일이 생겼나 — C1 ═══════════════════════════════════════════════
 * `QuestionCard`는 `item.choices`를 **적힌 순서 그대로** 그렸다. 그런데 콘텐츠의 정답 위치가
 * 균등하지 않다. 2026-08-18 `content.json` 전수 재계측(이 세션이 직접 다시 셌다):
 *
 *   · 4지선다 전체 1,315문항 — A 395 / B 372 / C 321 / D 227 · χ² = **50.7**
 *   · 기준 월드(1~5)만 307문항 — A 40.7% / B 31.3% / C 20.8% / **D 7.2%** · χ² = **76.3**
 *   · **월드 1은 44문항 중 27개(61.4%)가 A**다.
 *   · 반대로 확장 월드 6~9는 χ² 0.1~3.2로 균등하다(나중에 만든 것이라 저작 규격이 있었다).
 *
 * 무엇이 문제인가: **아이가 영어를 몰라도 A를 찍으면 월드 1에서 61%를 맞힌다.**
 * 그러면 정답률은 실력이 아니라 위치 습관을 잰다. 이 앱이 낸 모든 지표(취약 영역·처방·보상)가
 * 그 위에 서 있다. 콘텐츠를 다시 쓰는 것보다 **그리는 순간 섞는 것**이 근본적이다 —
 * 앞으로 만들 문항이 또 치우쳐도 아이 화면에서는 균등하기 때문이다.
 *
 * ═══ 설계 ════════════════════════════════════════════════════════════════
 * ① `choicePermutation(n, seed)` 는 **순수 함수**다(같은 seed → 같은 순열). 검사가 전수로 잰다.
 * ② 씨앗은 문항 id + **그 문항을 이번에 몇 번째로 만나는가** + 앱 실행마다 다른 소금.
 *    → 같은 문항을 다시 만나면 **자리가 바뀐다.** 자리를 외우는 길이 막힌다.
 * ③ 한 문항을 푸는 동안에는 자리가 고정된다(다시 도전 🔁 포함). 누르는 도중 답이 움직이면 그건 함정이다.
 * ④ 기록으로 나가는 인덱스는 **원본 인덱스**로 되돌린다 — `answer_events`의 과거 데이터와
 *    비교 가능성이 끊기지 않게. (화면 자리는 매번 다르지만 "무엇을 골랐는가"는 그대로다.)
 *
 * ═══ 왜 하위 비트를 안 쓰나 (`review.ts:gradeSwapped`가 두 번 틀렸던 자리) ═══
 * 곱셈 해시의 최하위 비트는 입력의 최하위 비트에 그대로 끌려간다 — `& 1`을 쓰면 좌·우가 정확히
 * 교대해 버린다. 그래서 murmur3 fmix32로 32비트를 완전히 섞고 **상위 비트(부동소수 정규화)** 로
 * 인덱스를 뽑는다. 균등성은 `shuffle_check.mjs`가 전수 표본으로 잰다.
 */

/** murmur3 finalizer — 32비트를 고르게 섞는다. 반환은 부호 없는 32비트. */
export function fmix32(n: number): number {
  let x = n | 0
  x ^= x >>> 16
  x = Math.imul(x, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  x ^= x >>> 16
  return x >>> 0
}

/** FNV-1a + fmix32 — 문자열 id를 32비트 씨앗으로. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return fmix32(h)
}

/**
 * 길이 n의 순열을 만든다. 반환값 `p`의 의미: **화면 i번째 = 원본 p[i]번째**.
 * Fisher-Yates(내림차순)이며, 난수는 상위 비트만 쓴다(모듈러 편향·하위 비트 상관 회피).
 */
export function choicePermutation(n: number, seed: number): number[] {
  const a: number[] = []
  for (let i = 0; i < n; i++) a.push(i)
  let st = fmix32(seed ^ 0x9e3779b9)
  for (let i = n - 1; i > 0; i--) {
    st = fmix32(st + 0x6d2b79f5)
    const j = Math.floor((st / 4294967296) * (i + 1))
    const t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}

/** 앱 실행마다 달라지는 소금 — 어제와 오늘의 자리가 같지 않게. */
const SALT = (() => {
  try { return fmix32(Math.floor(Math.random() * 4294967296)) } catch { return 0x5bf03635 }
})()

/** 문항별 등장 횟수 — 같은 문항을 다시 만나면 다른 순열이 나오게 한다. */
const seenCount = new Map<string, number>()

/** 이번에 이 문항을 그릴 때 쓸 씨앗. 부를 때마다 값이 달라진다(등장 횟수가 오르므로). */
export function nextPresentationSeed(id: string): number {
  const k = (seenCount.get(id) ?? 0) + 1
  seenCount.set(id, k)
  return fmix32(hashStr(id) ^ Math.imul(k, 0x9e3779b1) ^ SALT)
}

/** 검사·하네스 전용 — 등장 횟수 초기화. */
export function _resetPresentationCounts(): void { seenCount.clear() }
