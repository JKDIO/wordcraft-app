// v1.4.28 ⚔️ 룬 장비창 — 뱃지 전체를 "한 그림"으로 보여주기 위한 규칙·픽셀 데이터
//
// ★설계 원칙 (Dio님 지시로 확정)★
//   뱃지 1개 = 그림 조각 1개로 만들면 **커리큘럼이 늘 때마다 그림을 다시 그려야 한다.**
//   그래서 **카테고리 = 장비 슬롯**으로 고정하고, 각 슬롯은 그 카테고리의 달성률로 자란다.
//   뱃지가 71개든 100개든 그림은 그대로다 — 새 뱃지는 슬롯의 분모만 바꾼다. (L30의 시각판)
//
// 구현 제약: 캔버스·SVG 애니메이션을 쓰지 않는다. 예한이 폰은 APK WebView라
//   브라우저 전용 API에 의존하면 조용히 죽는다(L8). 여기는 box-shadow 픽셀 + CSS만 쓴다.
import type { BadgeGroup } from './badges'

/* ============================================================
   1. 슬롯 — 카테고리 ↔ 장비 부위
   ============================================================ */
export interface SlotDef {
  group: BadgeGroup
  part: string      // 부위 이름 (아이에게 보이는 말)
  emoji: string     // 장비 아이콘
}

/** 배치 순서 = 화면 그리드(폭에 맞춰 자동 줄바꿈). 왼쪽 위부터.
 *  ⚠️ 카테고리가 늘면 여기에 슬롯을 **한 줄만** 추가하면 된다 — 그림은 다시 안 그린다. */
/** ★순서는 BadgeGroup 선언 순서 = 뱃지 도감 순서와 반드시 같아야 한다★ (Dio님 지적 2026-08-14)
 *  장비칸과 도감 칸이 다른 순서로 놓이면 아이가 "이 장비가 어느 분야인지"를 매번 다시 찾아야 한다. */
export const LOADOUT_SLOTS: SlotDef[] = [
  { group: '정복',        part: '흉갑',   emoji: '🛡️' },
  { group: '소리와 철자',  part: '귀걸이', emoji: '🔔' },
  { group: '문장과 문법',  part: '검',     emoji: '⚔️' },
  { group: '읽기의 눈',    part: '투구',   emoji: '🥽' },
  { group: '단어 조립',    part: '장갑',   emoji: '🧤' },
  { group: '말하기',      part: '망토',   emoji: '🧣' },
  { group: '쓰기',        part: '어깨',   emoji: '🎽' },
  { group: '꾸준함',      part: '오라',   emoji: '🔥' },
  { group: '복습과 기억',  part: '곡괭이', emoji: '⛏️' },
  { group: '단어 대륙',    part: '부츠',   emoji: '🥾' },
  { group: '수호자와 보스', part: '왕관',  emoji: '👑' },
]

/** 슬롯 등급 0~4 — 그 카테고리를 얼마나 채웠는가.
 *  0 빈 슬롯 / 1 낡은 / 2 강철 / 3 룬각인 / 4 전설(전부 획득) */
export function slotTier(got: number, total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || got <= 0) return 0
  if (got >= total) return 4
  const pct = got / total
  if (pct < 1 / 3) return 1
  if (pct < 2 / 3) return 2
  return 3
}

export const TIER_NAME = ['빈 슬롯', '낡은', '강철', '룬각인', '전설'] as const
/** 등급별 색 — 테두리 / 배경 / 발광 */
export const TIER_STYLE: { border: string; bg: string; glow: string; text: string }[] = [
  { border: 'rgba(255,255,255,.14)', bg: 'rgba(255,255,255,.03)', glow: 'none',                                text: 'rgba(255,255,255,.35)' },
  { border: '#8a5a3b',               bg: 'rgba(138,90,59,.16)',   glow: 'none',                                text: '#d9a066' },
  { border: '#8fd4ff',               bg: 'rgba(143,212,255,.14)', glow: '0 0 8px rgba(143,212,255,.35)',       text: '#8fd4ff' },
  { border: '#b98cff',               bg: 'rgba(185,140,255,.16)', glow: '0 0 12px rgba(185,140,255,.45)',      text: '#cfb0ff' },
  { border: '#f5c542',               bg: 'rgba(245,197,66,.18)',  glow: '0 0 16px rgba(245,197,66,.6)',        text: '#f5c542' },
]

/* ============================================================
   2. 영웅 — 전체 달성률로 자라는 픽셀 스프라이트
   ============================================================ */
/** 전체 달성률 → 영웅 단계 0~4
 *  ⚠️ 문턱을 높게 잡으면 안 된다. 처음 설계는 0~19%를 전부 '맨손'으로 뒀는데,
 *     뱃지를 14개나 딴 아이가 여전히 맨몸으로 서 있었다 — 그건 보상이 아니라 벌이다.
 *     **뱃지를 하나라도 따면 즉시 장비가 생긴다.** 대신 마지막 단계는 진짜로 어렵게 둔다. */
export function heroStage(got: number, total: number): 0 | 1 | 2 | 3 | 4 {
  if (total <= 0 || got <= 0) return 0
  const pct = got / total
  if (pct < 0.2) return 1   // 갑옷
  if (pct < 0.45) return 2  // + 망토
  if (pct < 0.75) return 3  // + 투구
  return 4                  // 전설 금장
}
/** 전부 모았을 때만 붙는 최종 칭호 — 75%부터 전설 장비를 입지만 '완전체'는 100%뿐이다 */
export const isComplete = (got: number, total: number) => total > 0 && got >= total

export const HERO_TITLE = [
  '맨손의 도전자',
  '견습 룬술사',
  '룬 기사',
  '룬을 깨우는 자',
  '전설의 크래프터',
] as const
export const COMPLETE_TITLE = '전설의 크래프터 — 완전체 ⚡'

export const HERO_SUB = [
  '아직 장비가 없어. 뱃지를 하나만 따도 갑옷이 생긴다',
  '갑옷을 입었다. 20%를 넘기면 망토가 붙는다',
  '망토가 휘날린다. 45%를 넘기면 투구다',
  '투구까지 갖췄다. 75%를 넘기면 전설의 금장',
  '전설 장비. 전부 모으면 완전체가 된다',
] as const
export const COMPLETE_SUB = '빈 슬롯이 하나도 없다. 이 장비는 아무나 못 입는다'

/**
 * 영웅 픽셀 그리드 (12×16)
 *   h 머리   m 투구(3단계~)   s 피부   e 눈   M 입
 *   A 갑옷   t 옷(기본)       c 망토(2단계~)  b 부츠
 * 같은 글자라도 **단계에 따라 색이 바뀐다** — 그래서 그림을 하나만 그려도 5단계가 나온다.
 */
export const HERO_GRID: string[] = [
  '....hhhh....',
  '...hhhhhh...',
  '..hssssssh..',
  '..hseesseh..',
  '..hssssssh..',
  '...ssMMss...',
  '..cAAAAAAc..',
  '.ccAAAAAAcc.',
  '.ccAAAAAAcc.',
  '.ccAAAAAAcc.',
  '..cAAAAAAc..',
  '...tttttt...',
  '...tt..tt...',
  '...tt..tt...',
  '...bb..bb...',
  '...bb..bb...',
]

/** 단계별 팔레트. null이면 그 픽셀은 **그리지 않는다**(망토·투구가 아직 없는 상태) */
export function heroPalette(stage: 0 | 1 | 2 | 3 | 4): Record<string, string | null> {
  const skin = '#f0c9a0', eye = '#141821', mouth = '#8a4a3b'
  const base: Record<string, string | null> = {
    h: '#6b4423', s: skin, e: eye, M: mouth,
    A: '#4a5aa8', t: '#3a4680', b: '#2d3a75', c: null,
  }
  if (stage === 0) return base
  if (stage === 1) return { ...base, A: '#8a8f9e', t: '#5a6070', b: '#3b3f4c' }              // 낡은 철
  if (stage === 2) return { ...base, A: '#b8c4d8', t: '#7b8698', b: '#4a5160', c: '#3a6fd8' } // 강철 + 파란 망토
  if (stage === 3) return { ...base, h: '#c9cede', A: '#cbb2ff', t: '#8b74c4', b: '#5a4a86', c: '#7b3fd8' } // 룬각인 + 투구
  return { ...base, h: '#a87a12', A: '#f5c542', t: '#c79a24', b: '#8a6a10', c: '#ffe9a8' }    // 전설(금) — 머리는 진한 금으로 둬야 얼굴이 읽힌다
}

/** box-shadow 픽셀 렌더 문자열 — forgeStage.ts와 같은 기법(검증된 방식) */
export function heroShadow(stage: 0 | 1 | 2 | 3 | 4, px: number): string {
  const pal = heroPalette(stage)
  const parts: string[] = []
  for (let y = 0; y < HERO_GRID.length; y++) {
    const row = HERO_GRID[y]
    for (let x = 0; x < row.length; x++) {
      const c = pal[row.charAt(x)]
      if (c) parts.push(`${x * px}px ${y * px}px 0 ${c}`)
    }
  }
  return parts.join(',')
}

export const HERO_W = 12
export const HERO_H = 16
