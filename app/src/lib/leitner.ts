// 라이트너 5칸 간격반복 — 박스 N 정답 시 N+1 이동, 오답 시 박스 1로
// 복습 주기(일): 박스1=0(오늘), 2=1, 3=3, 4=7, 5=14
// index = box. 시안 09 라이트너 주기(매일/2일/4일/7일/14일)와 일치 (E8 봉합)
export const BOX_INTERVALS = [0, 0, 2, 4, 7, 14]

/** KST 기준 날짜 문자열 (R-10 봉합: UTC 사용 시 오전 9시 이전 날짜 오류) */
export function kstDateStr(d: Date = new Date()): string {
  return d.toLocaleDateString('sv', { timeZone: 'Asia/Seoul' })
}

export function nextDue(box: number, correct: boolean): { box: number; due_date: string } {
  const newBox = correct ? Math.min(box + 1, 5) : 1
  const days = BOX_INTERVALS[newBox]
  const d = new Date()
  d.setDate(d.getDate() + days)
  return { box: newBox, due_date: kstDateStr(d) }
}

export function todayStr(): string {
  return kstDateStr()
}

/** KST 기준 어제 날짜 (스트릭 판정용 — toISOString(UTC) 사용 시 오전 9시 이전 리셋 버그, 7/16 봉합) */
export function kstTomorrowStr(): string {
  return kstDateStr(new Date(Date.now() + 86400000))
}

/** KST 기준 어제 날짜 (스트릭 판정용) */
export function kstYesterdayStr(): string {
  return kstDateStr(new Date(Date.now() - 86400000))
}
