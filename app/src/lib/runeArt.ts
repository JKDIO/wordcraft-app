// v1.3.0 수정 동굴 입모양 다이어그램 — 단일 원천 (CONTRACT v1.3 §11)
// 15개 art_key. 인라인 SVG 문자열 (WebView 안전, 외부 리소스 0, 이중 부호화 원리).
// 공통 캔버스 120×110: 얼굴 윤곽(측면 아님, 정면 입 클로즈업) + 입술/이/혀 표현.

const FACE = `<ellipse cx="60" cy="55" rx="52" ry="48" fill="#FFD9A0" stroke="#C98F4E" stroke-width="3"/>`
const wrap = (inner: string, label: string) =>
  `<svg viewBox="0 0 120 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${label}">${FACE}${inner}</svg>`

/** 입모양 아트 15종 — RUNE_SPEC art_key 허용 목록과 1:1 */
export const RUNE_ART: Record<string, { svg: string; hint_ko: string }> = {
  lips_relaxed: {
    hint_ko: '입에 힘을 빼고 살짝만 벌려',
    svg: wrap(`<path d="M38 62 Q60 70 82 62 Q60 78 38 62Z" fill="#B3564D" stroke="#8E3B33" stroke-width="2.5"/>`, '힘 뺀 입'),
  },
  lips_spread: {
    hint_ko: '입꼬리를 귀 쪽으로 쭉! 미소 입',
    svg: wrap(`<path d="M28 60 Q60 76 92 60 Q60 84 28 60Z" fill="#B3564D" stroke="#8E3B33" stroke-width="2.5"/><path d="M30 60 Q60 68 90 60" fill="#fff" stroke="#ddd" stroke-width="1"/>`, '옆으로 미소 입'),
  },
  lips_round: {
    hint_ko: '입술을 도넛처럼 동그랗게',
    svg: wrap(`<circle cx="60" cy="66" r="15" fill="#7A2E27"/><circle cx="60" cy="66" r="15" fill="none" stroke="#B3564D" stroke-width="7"/>`, '동그란 입'),
  },
  lips_round_small: {
    hint_ko: '뽀뽀하듯 입술을 작게 앞으로 쪽',
    svg: wrap(`<circle cx="60" cy="66" r="8" fill="#7A2E27"/><circle cx="60" cy="66" r="8" fill="none" stroke="#B3564D" stroke-width="6"/>`, '작고 동그란 뽀뽀 입'),
  },
  jaw_drop: {
    hint_ko: '턱을 아래로 뚝! 크게 벌려',
    svg: wrap(`<ellipse cx="60" cy="70" rx="20" ry="24" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/><path d="M46 58 h28" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`, '턱 크게 벌린 입'),
  },
  teeth_lip: {
    hint_ko: '윗니를 아랫입술에 살짝 대고 바람 새는 소리 (f/v)',
    svg: wrap(`<path d="M36 60 Q60 66 84 60 L84 70 Q60 80 36 70Z" fill="#B3564D" stroke="#8E3B33" stroke-width="2.5"/><rect x="46" y="56" width="28" height="10" rx="2" fill="#fff" stroke="#ccc"/><path d="M88 52 q8 4 0 8 M94 48 q10 6 0 12" stroke="#58A6E8" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, '윗니가 아랫입술에 닿는 입'),
  },
  tongue_teeth: {
    hint_ko: '혀끝을 이 사이로 빼꼼! (th)',
    svg: wrap(`<path d="M38 58 Q60 62 82 58 L82 74 Q60 82 38 74Z" fill="#B3564D" stroke="#8E3B33" stroke-width="2.5"/><rect x="44" y="54" width="32" height="8" rx="2" fill="#fff" stroke="#ccc"/><ellipse cx="60" cy="66" rx="12" ry="7" fill="#E4726C" stroke="#B34F4A" stroke-width="2"/>`, '혀끝이 이 사이로 나온 입'),
  },
  tongue_curl: {
    hint_ko: '혀를 뒤로 말아 올려 — 어디에도 닿지 않게! (r)',
    svg: wrap(`<ellipse cx="60" cy="66" rx="20" ry="14" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/><path d="M50 72 Q60 58 70 66 Q66 60 58 62" fill="#E4726C" stroke="#B34F4A" stroke-width="2"/>`, '혀를 뒤로 만 입 속'),
  },
  tongue_tip: {
    hint_ko: '혀끝을 윗잇몸에 콕! (l/t/d/n)',
    svg: wrap(`<ellipse cx="60" cy="68" rx="20" ry="14" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/><rect x="46" y="54" width="28" height="7" rx="2" fill="#fff" stroke="#ccc"/><path d="M56 76 Q58 64 62 60" stroke="#E4726C" stroke-width="7" fill="none" stroke-linecap="round"/>`, '혀끝이 윗잇몸에 닿는 입 속'),
  },
  tongue_back: {
    hint_ko: '혀 뒤쪽을 목천장 쪽으로 올려 (k/g/ng)',
    svg: wrap(`<ellipse cx="60" cy="68" rx="20" ry="14" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/><path d="M48 74 Q56 72 64 64 Q70 58 74 60" stroke="#E4726C" stroke-width="7" fill="none" stroke-linecap="round"/>`, '혀 뒤쪽이 올라간 입 속'),
  },
  lips_together: {
    hint_ko: '두 입술을 딱 붙였다가 팡! (p/b/m)',
    svg: wrap(`<path d="M36 64 Q60 60 84 64 Q60 72 36 64Z" fill="#B3564D" stroke="#8E3B33" stroke-width="3"/><path d="M40 64 Q60 66 80 64" stroke="#7A2E27" stroke-width="2" fill="none"/>`, '꾹 다문 입술'),
  },
  teeth_close: {
    hint_ko: '이를 가까이 붙이고 바람만 스— (s/z)',
    svg: wrap(`<path d="M38 60 Q60 64 82 60 L82 72 Q60 78 38 72Z" fill="#B3564D" stroke="#8E3B33" stroke-width="2.5"/><rect x="45" y="58" width="30" height="6" rx="1.5" fill="#fff" stroke="#ccc"/><rect x="45" y="66" width="30" height="6" rx="1.5" fill="#fff" stroke="#ccc"/><path d="M88 58 q8 4 0 8" stroke="#58A6E8" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, '위아래 이가 가까운 입'),
  },
  lips_forward: {
    hint_ko: '입술을 앞으로 쭉 내밀고 쉬— (sh/ch)',
    svg: wrap(`<ellipse cx="60" cy="66" rx="13" ry="10" fill="#7A2E27"/><ellipse cx="60" cy="66" rx="13" ry="10" fill="none" stroke="#B3564D" stroke-width="7"/><path d="M80 60 q8 6 0 12 M86 56 q10 8 0 20" stroke="#58A6E8" stroke-width="2.5" fill="none" stroke-linecap="round"/>`, '앞으로 내민 입술'),
  },
  open_mid: {
    hint_ko: '입을 중간만큼 편하게 벌려 (e/어)',
    svg: wrap(`<ellipse cx="60" cy="66" rx="17" ry="11" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/>`, '중간 크기로 벌린 입'),
  },
  open_wide: {
    hint_ko: '입을 크게 + 옆으로도 활짝 (애!)',
    svg: wrap(`<ellipse cx="60" cy="66" rx="26" ry="15" fill="#7A2E27" stroke="#B3564D" stroke-width="5"/><rect x="42" y="56" width="36" height="7" rx="2" fill="#fff" stroke="#ccc"/>`, '크고 넓게 벌린 입'),
  },
}

export function runeArtOf(key?: string | null): { svg: string; hint_ko: string } | null {
  if (!key) return null
  return RUNE_ART[key] || null
}
