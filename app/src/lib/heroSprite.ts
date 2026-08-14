// v1.4.34 ⚔️ 룬 기사 스프라이트 — 부위 레이어 조립 규칙 (단일 원천)
//
// ★설계★ 뱃지 카테고리 = 장비 슬롯. 그 카테고리를 채울수록 그 부위만 등급이 오른다.
//   전신 그림을 등급마다 새로 그리는 게 아니라, **투명 레이어 11장을 겹친다.**
//   → 커리큘럼이 늘어 뱃지가 100개가 되어도 그림은 다시 안 그린다. 슬롯의 분모만 바뀐다.
//
// ★왜 canvas를 안 쓰나★ 예한이 폰은 APK WebView다. 브라우저 전용 API에 기대면 조용히 죽는다(L8).
//   그래서 <img>를 겹치는 것만 쓴다. 이건 WebView에서 확실히 돌아간다.
//
// 자산은 Supabase Storage(public)에 있다. 앱 번들에 넣지 않는다 — 번들이 붓지 않고,
// 그림을 고쳐도 앱 재배포 없이 반영된다. 생성·후처리 파이프라인은
// `앱개발/자동화_이미지자산_파이프라인_v1.md` 참조.
import type { BadgeGroup } from './badges'

export const ART_BASE =
  'https://gbynvzxgbpmoqdsriowz.supabase.co/storage/v1/object/public/art/hero/'

export type SlotKey =
  | 'aura' | 'cloak' | 'shoulder' | 'boots' | 'chest'
  | 'gloves' | 'helm' | 'earring' | 'crown' | 'pick' | 'sword'

/** 카테고리 → 부위. loadout.ts의 LOADOUT_SLOTS와 짝이 맞아야 한다 */
export const SLOT_KEY: Record<BadgeGroup, SlotKey> = {
  '정복': 'chest',
  '문장과 문법': 'sword',
  '읽기의 눈': 'helm',
  '단어 조립': 'gloves',
  '말하기': 'cloak',
  '쓰기': 'shoulder',
  '소리와 철자': 'earring',
  '꾸준함': 'aura',
  '복습과 기억': 'pick',
  '단어 대륙': 'boots',
  '수호자와 보스': 'crown',
}

/**
 * 그리는 순서 = 앞뒤 관계. 뒤에 올수록 위에 온다.
 * ★무기(pick·sword)는 반드시 helm보다 뒤★ — 앞에 두면 투구 옆 날개가 검을 덮는다(Dio님 지적).
 */
export const Z_ORDER: SlotKey[] = [
  'aura', 'cloak', 'shoulder', 'boots', 'chest',
  'gloves', 'helm', 'earring', 'crown', 'pick', 'sword',
]

export const SPRITE_PX = 128

/**
 * ★자산 버전 — 그림을 고칠 때마다 반드시 올린다★ (2026-08-14 제정)
 * Supabase Storage는 Cache-Control을 1시간으로 준다. 그림만 갈아끼우면
 * 브라우저·WebView가 최대 1시간 동안 옛 그림을 계속 쓴다 — 실제로 곡괭이 위치를 고쳤는데
 * 화면이 안 바뀌었다(Dio님 신고). 주소에 버전을 붙이면 즉시 새 그림을 받는다.
 */
export const ART_VER = '2'
export const heroBaseUrl = () => `${ART_BASE}base.png?v=${ART_VER}`
export const heroLayerUrl = (k: SlotKey, t: 1 | 2 | 3 | 4) =>
  `${ART_BASE}layer/${k}${t}.png?v=${ART_VER}`

/* ============================================================
   등급 상승 감지 — "언제 축하할지"를 아는 유일한 방법
   ============================================================ */
/**
 * 마지막으로 아이가 본 슬롯 등급을 기억한다. 다음에 열었을 때 올라가 있으면 그 부위를 축하한다.
 *
 * ★왜 필요한가★ 장비는 뱃지를 딴 그 순간이 아니라 **다음에 장비창을 열 때** 바뀌어 있다.
 *   아무 표시가 없으면 아이는 뭐가 달라졌는지 모른 채 지나간다 — 보상이 없는 것과 같다.
 * ★L17 준수★ 새 localStorage 키를 추가할 뿐, 기존 키는 건드리지 않는다.
 */
const SEEN_KEY = 'wc_loadout_seen_v1'

export function readSeenTiers(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch { return {} }
}

export function writeSeenTiers(m: Record<string, number>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)) } catch { /* 사파리 프라이빗 등 — 조용히 넘어간다 */ }
}

/** 올라간 슬롯만 돌려준다. **처음 여는 경우(기록 없음)는 축하하지 않는다** — 전부 반짝이면 의미가 없다 */
export function findUpgrades(cur: Record<string, number>, seen: Record<string, number>): string[] {
  if (!Object.keys(seen).length) return []
  return Object.keys(cur).filter(k => (cur[k] ?? 0) > (seen[k] ?? 0))
}

/** 미리 받아둔다 — 등급이 오르는 순간 그림이 늦게 뜨면 보상의 맛이 죽는다 */
let warmed = false
export function warmHeroArt() {
  if (warmed || typeof Image === 'undefined') return
  warmed = true
  const q: string[] = [heroBaseUrl()]
  for (const k of Z_ORDER) for (const t of [1, 2, 3, 4] as const) q.push(heroLayerUrl(k, t))
  // 한꺼번에 45개를 물면 느린 회선에서 학습 화면까지 느려진다. 천천히 흘린다.
  let i = 0
  const tick = () => {
    if (i >= q.length) return
    const im = new Image()
    im.src = q[i++]
    setTimeout(tick, 60)
  }
  tick()
}
